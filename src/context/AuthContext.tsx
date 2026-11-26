import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../config/firebase';
import { AppUser, UserRole } from '../types';

export interface UserInvite {
  id: string; // normalized email
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  invitedBy: string;
  createdAt: string;
  acceptedAt?: string;
}

interface AuthContextType {
  currentUser: User | null;
  appUser: AppUser | null;
  role: UserRole | null;
  isAdmin: boolean;
  isColaborador: boolean;
  loading: boolean;
  authBlockedMessage: string | null;
  clearAuthBlockedMessage: () => void;
  usersList: AppUser[];
  userInvites: UserInvite[];
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  createStaffAccount: (email: string, pass: string, displayName: string, role: UserRole) => Promise<void>;
  createUserInvite: (email: string, displayName: string, role: UserRole) => Promise<void>;
  revokeUserInvite: (email: string) => Promise<void>;
  updateUserRole: (targetUid: string, newRole: UserRole, email: string) => Promise<void>;
  toggleUserActive: (targetUid: string, currentActive: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const PRIMARY_ADMIN_EMAIL =
  (import.meta.env.VITE_PRIMARY_ADMIN_EMAIL as string | undefined) ||
  'alejandrodiazortiz07@gmail.com';

export function normalizeInviteId(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_');
}

export function validateStrongPassword(password: string): string | null {
  if (!password || password.length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'La contraseña debe combinar letras y números.';
  }
  return null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [authBlockedMessage, setAuthBlockedMessage] = useState<string | null>(null);
  const [usersList, setUsersList] = useState<AppUser[]>([]);
  const [userInvites, setUserInvites] = useState<UserInvite[]>([]);

  const clearAuthBlockedMessage = useCallback(() => {
    setAuthBlockedMessage(null);
  }, []);

  useEffect(() => {
    let unsubOwnProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (unsubOwnProfile) {
        unsubOwnProfile();
        unsubOwnProfile = null;
      }

      if (!user) {
        setCurrentUser(null);
        setAppUser(null);
        setRole(null);
        setUsersList([]);
        setUserInvites([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const userEmail = (user.email || '').trim().toLowerCase();
        const isPrimaryAdmin =
          Boolean(userEmail && userEmail === PRIMARY_ADMIN_EMAIL.trim().toLowerCase());

        // 1. Check /admins/{uid}
        const adminDocRef = doc(db, 'admins', user.uid);
        let isAdminUser = isPrimaryAdmin;

        try {
          const adminSnap = await getDoc(adminDocRef);
          if (adminSnap.exists()) {
            isAdminUser = true;
          } else if (isPrimaryAdmin) {
            await setDoc(adminDocRef, {
              email: user.email || PRIMARY_ADMIN_EMAIL,
              addedAt: new Date().toISOString(),
            });
            isAdminUser = true;
          }
        } catch (e) {
          console.warn('Verificación de admins en Firestore:', e);
          if (isPrimaryAdmin) isAdminUser = true;
        }

        // 2. Check existing /users/{uid}
        const userDocRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userDocRef);

        let finalRole: UserRole | null = null;
        let displayName = user.displayName || (isAdminUser ? 'Administrador Pollos Karen' : 'Personal');
        let isActive = false;

        if (userSnap.exists()) {
          const data = userSnap.data();
          const storedRole = data.role as UserRole;
          finalRole = isAdminUser
            ? 'admin'
            : storedRole === 'admin' || storedRole === 'colaborador'
              ? storedRole
              : null;
          displayName = data.displayName || displayName;
          isActive = data.active !== false;
        } else if (isPrimaryAdmin || isAdminUser) {
          // Bootstrap primary or pre-registered admin into /users/{uid}
          finalRole = 'admin';
          isActive = true;
          const newProfile: AppUser = {
            uid: user.uid,
            email: user.email || '',
            displayName,
            role: 'admin',
            active: true,
            createdAt: new Date().toISOString(),
          };
          await setDoc(userDocRef, newProfile);
        } else if (userEmail) {
          // Check pre-authorized staff invitation created by an Administrator
          const inviteId = normalizeInviteId(userEmail);
          try {
            const inviteRef = doc(db, 'user_invites', inviteId);
            const inviteSnap = await getDoc(inviteRef);
            if (inviteSnap.exists()) {
              const inviteData = inviteSnap.data() as UserInvite;
              if (
                inviteData.active !== false &&
                inviteData.email?.toLowerCase() === userEmail &&
                inviteData.role === 'colaborador'
              ) {
                finalRole = inviteData.role;
                displayName = inviteData.displayName || displayName;
                isActive = true;
                const nowIso = new Date().toISOString();
                await setDoc(userDocRef, {
                  uid: user.uid,
                  email: user.email || userEmail,
                  displayName,
                  role: finalRole,
                  active: true,
                  createdAt: nowIso,
                });
              }
            }
          } catch (inviteErr) {
            console.warn('No se encontró invitación preautorizada:', inviteErr);
          }
        }

        // 3. Reject unauthorized or deactivated accounts immediately (NO public self-registration)
        if (!finalRole) {
          await signOut(auth);
          setCurrentUser(null);
          setAppUser(null);
          setRole(null);
          setAuthBlockedMessage(
            'Cuenta no autorizada. Por seguridad interna, solo el personal habilitado por el administrador de Pollos Karen puede ingresar.'
          );
          setLoading(false);
          return;
        }

        if (!isActive && !isPrimaryAdmin) {
          await signOut(auth);
          setCurrentUser(null);
          setAppUser(null);
          setRole(null);
          setAuthBlockedMessage(
            'Su cuenta ha sido desactivada. Comuníquese con el administrador de Pollos Karen.'
          );
          setLoading(false);
          return;
        }

        const resolvedProfile: AppUser = {
          uid: user.uid,
          email: user.email || '',
          displayName,
          role: finalRole,
          active: true,
        };

        setAuthBlockedMessage(null);
        setCurrentUser(user);
        setAppUser(resolvedProfile);
        setRole(finalRole);
        setLoading(false);

        // 4. Real-time session revocation & role synchronization listener
        unsubOwnProfile = onSnapshot(
          userDocRef,
          liveSnap => {
            if (!liveSnap.exists()) {
              if (!isPrimaryAdmin) {
                setAuthBlockedMessage('Su perfil fue revocado por el administrador.');
                signOut(auth).catch(() => {});
              }
              return;
            }
            const liveData = liveSnap.data();
            const liveActive = liveData.active !== false;
            if (!liveActive && !isPrimaryAdmin) {
              setAuthBlockedMessage('Su cuenta ha sido suspendida por el administrador.');
              signOut(auth).catch(() => {});
              return;
            }
            const liveRole: UserRole | null = isPrimaryAdmin
              ? 'admin'
              : liveData.role === 'admin' || liveData.role === 'colaborador'
                ? liveData.role
                : null;
            if (!liveRole) {
              setCurrentUser(null);
              setAppUser(null);
              setRole(null);
              setAuthBlockedMessage('El rol de cocina fue retirado. Contacte al administrador si necesita acceso al POS.');
              signOut(auth).catch(() => {});
              return;
            }

            setRole(liveRole);
            setAppUser({
              uid: user.uid,
              email: liveData.email || user.email || '',
              displayName: liveData.displayName || displayName,
              role: liveRole,
              active: liveActive,
            });
          },
          err => {
            console.warn('Escucha de perfil propio interrumpida:', err);
          }
        );
      } catch (error) {
        console.error('Error verificando autorización de usuario:', error);
        await signOut(auth).catch(() => {});
        setCurrentUser(null);
        setAppUser(null);
        setRole(null);
        setAuthBlockedMessage(
          'No fue posible verificar la autorización de su cuenta. Intente nuevamente o contacte al administrador.'
        );
        setLoading(false);
      }
    });

    return () => {
      if (unsubOwnProfile) unsubOwnProfile();
      unsubscribe();
    };
  }, []);

  // Subscribe to users list & pre-authorized invites when logged in as admin
  useEffect(() => {
    if (!currentUser || role !== 'admin') {
      setUsersList([]);
      setUserInvites([]);
      return;
    }

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      snapshot => {
        const list: AppUser[] = snapshot.docs.map(d => ({
          uid: d.id,
          ...(d.data() as Omit<AppUser, 'uid'>),
        }));
        list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        setUsersList(list);
      },
      err => {
        console.warn('Error cargando lista de usuarios:', err);
      }
    );

    const unsubInvites = onSnapshot(
      collection(db, 'user_invites'),
      snapshot => {
        const list: UserInvite[] = snapshot.docs.map(d => ({
          id: d.id,
          ...(d.data() as Omit<UserInvite, 'id'>),
        }));
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setUserInvites(list);
      },
      err => {
        console.warn('Error cargando invitaciones:', err);
      }
    );

    return () => {
      unsubUsers();
      unsubInvites();
    };
  }, [currentUser, role]);

  const loginWithGoogle = async () => {
    setAuthBlockedMessage(null);
    await signInWithPopup(auth, googleProvider);
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setAuthBlockedMessage(null);
    await signInWithEmailAndPassword(auth, email.trim(), pass);
  };

  const sendPasswordReset = async (email: string) => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      throw new Error('Ingrese su correo electrónico para restablecer la contraseña.');
    }
    await sendPasswordResetEmail(auth, cleanEmail);
  };

  const createStaffAccount = async (
    email: string,
    pass: string,
    displayName: string,
    targetRole: UserRole
  ) => {
    if (role !== 'admin') {
      throw new Error('Solo un administrador puede crear nuevas cuentas de personal.');
    }

    if (targetRole !== 'admin' && targetRole !== 'colaborador') {
      throw new Error('El rol de cocina fue retirado.');
    }
    const passError = validateStrongPassword(pass);
    if (passError) {
      throw new Error(passError);
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();
    if (!cleanEmail || !cleanName) {
      throw new Error('Debe completar el nombre y el correo electrónico.');
    }

    const secondaryAppName = 'StaffAccountCreatorApp';
    const existingSecondary = getApps().find(a => a.name === secondaryAppName);
    const secondaryApp = existingSecondary || initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, pass);
    const newUser = cred.user;
    await signOut(secondaryAuth);

    const nowIso = new Date().toISOString();

    await setDoc(doc(db, 'users', newUser.uid), {
      uid: newUser.uid,
      email: cleanEmail,
      displayName: cleanName,
      role: targetRole,
      active: true,
      createdAt: nowIso,
    });

    if (targetRole === 'admin') {
      await setDoc(doc(db, 'admins', newUser.uid), {
        email: cleanEmail,
        addedAt: nowIso,
      });
    }

    const audId = `aud_usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await setDoc(doc(db, 'audit_logs', audId), {
      id: audId,
      action: 'manage_user',
      collection: 'users',
      documentId: newUser.uid,
      reason: `Creación de cuenta de personal (${targetRole.toUpperCase()})`,
      performedBy: appUser?.displayName || currentUser?.email || 'Administrador',
      performedByUid: currentUser?.uid || '',
      performedByEmail: currentUser?.email || '',
      timestamp: nowIso,
      details: `Usuario creado: ${cleanName} (${cleanEmail}) con rol ${targetRole}.`,
    });
  };

  const createUserInvite = async (email: string, displayName: string, targetRole: UserRole) => {
    if (role !== 'admin') {
      throw new Error('Solo un administrador puede preautorizar correos de Google.');
    }
    if (targetRole !== 'colaborador') {
      throw new Error('Solo se permiten invitaciones para colaboradores.');
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();
    if (!cleanEmail || !cleanName) {
      throw new Error('Complete nombre y correo electrónico.');
    }
    const inviteId = normalizeInviteId(cleanEmail);
    const nowIso = new Date().toISOString();
    await setDoc(doc(db, 'user_invites', inviteId), {
      id: inviteId,
      email: cleanEmail,
      displayName: cleanName,
      role: targetRole,
      active: true,
      invitedBy: appUser?.displayName || currentUser?.email || 'Administrador',
      createdAt: nowIso,
    });
  };

  const revokeUserInvite = async (email: string) => {
    if (role !== 'admin') {
      throw new Error('Solo un administrador puede revocar autorizaciones.');
    }
    const inviteId = normalizeInviteId(email);
    await deleteDoc(doc(db, 'user_invites', inviteId));
  };

  const updateUserRole = async (targetUid: string, newRole: UserRole, email: string) => {
    if (role !== 'admin') {
      throw new Error('Solo un administrador puede modificar roles de usuarios.');
    }
    if (email && email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase() && newRole !== 'admin') {
      throw new Error('Por seguridad, no se puede degradar la cuenta del Administrador Principal.');
    }

    if (newRole !== 'admin' && newRole !== 'colaborador') {
      throw new Error('El rol de cocina fue retirado.');
    }
    const nowIso = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'users', targetUid), {
        role: newRole,
        updatedAt: nowIso,
      });

      if (newRole === 'admin') {
        await setDoc(doc(db, 'admins', targetUid), {
          email: email || '',
          addedAt: nowIso,
        });
      } else {
        await deleteDoc(doc(db, 'admins', targetUid)).catch(() => {});
      }

      const audId = `aud_role_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await setDoc(doc(db, 'audit_logs', audId), {
        id: audId,
        action: 'manage_user',
        collection: 'users',
        documentId: targetUid,
        reason: `Cambio de rol a ${newRole.toUpperCase()}`,
        performedBy: appUser?.displayName || currentUser?.email || 'Administrador',
        performedByUid: currentUser?.uid || '',
        performedByEmail: currentUser?.email || '',
        timestamp: nowIso,
        details: `Rol actualizado para ${email || targetUid}: ${newRole.toUpperCase()}.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
      throw error;
    }
  };

  const toggleUserActive = async (targetUid: string, currentActive: boolean) => {
    if (role !== 'admin') {
      throw new Error('Solo un administrador puede activar o desactivar usuarios.');
    }
    const targetUser = usersList.find(u => u.uid === targetUid);
    if (
      targetUser?.email &&
      targetUser.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase() &&
      currentActive
    ) {
      throw new Error('No se puede desactivar la cuenta del Administrador Principal.');
    }

    const nextActive = !currentActive;
    const nowIso = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'users', targetUid), {
        active: nextActive,
        updatedAt: nowIso,
      });

      const audId = `aud_act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await setDoc(doc(db, 'audit_logs', audId), {
        id: audId,
        action: 'manage_user',
        collection: 'users',
        documentId: targetUid,
        reason: nextActive ? 'Reactivación de cuenta de usuario' : 'Suspensión de cuenta de usuario',
        performedBy: appUser?.displayName || currentUser?.email || 'Administrador',
        performedByUid: currentUser?.uid || '',
        performedByEmail: currentUser?.email || '',
        timestamp: nowIso,
        details: `Estado de cuenta ${targetUser?.email || targetUid}: ${nextActive ? 'ACTIVO' : 'INACTIVO'}.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
      throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setAppUser(null);
    setRole(null);
  };

  const isAdmin = role === 'admin';
  const isColaborador = role === 'colaborador';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        appUser,
        role,
        isAdmin,
        isColaborador,
        loading,
        authBlockedMessage,
        clearAuthBlockedMessage,
        usersList,
        userInvites,
        loginWithGoogle,
        loginWithEmail,
        sendPasswordReset,
        createStaffAccount,
        createUserInvite,
        revokeUserInvite,
        updateUserRole,
        toggleUserActive,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
}
