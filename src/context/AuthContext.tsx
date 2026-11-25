import React, { createContext, useContext, useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../config/firebase';
import { AppUser, UserRole } from '../types';

interface AuthContextType {
  currentUser: User | null;
  appUser: AppUser | null;
  role: UserRole | null;
  isAdmin: boolean;
  isColaborador: boolean;
  loading: boolean;
  usersList: AppUser[];
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  createStaffAccount: (email: string, pass: string, displayName: string, role: UserRole) => Promise<void>;
  updateUserRole: (targetUid: string, newRole: UserRole, email: string) => Promise<void>;
  toggleUserActive: (targetUid: string, currentActive: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const PRIMARY_ADMIN_EMAIL = 'alejandrodiazortiz07@gmail.com';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [usersList, setUsersList] = useState<AppUser[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      setCurrentUser(user);

      if (user) {
        try {
          const isPrimaryAdmin =
            Boolean(user.email && user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase());

          // Check if admin doc exists in /admins/{uid}
          const adminDocRef = doc(db, 'admins', user.uid);
          let isAdminUser = isPrimaryAdmin;

          try {
            const adminSnap = await getDoc(adminDocRef);
            if (adminSnap.exists()) {
              isAdminUser = true;
            } else if (isPrimaryAdmin) {
              // Bootstrap primary admin doc into /admins/{uid}
              await setDoc(adminDocRef, {
                email: user.email,
                addedAt: new Date().toISOString(),
              });
              isAdminUser = true;
            }
          } catch (e) {
            console.warn('Verificación de admins en Firestore:', e);
            if (isPrimaryAdmin) isAdminUser = true;
          }

          // Fetch or initialize user profile in /users/{uid}
          const userDocRef = doc(db, 'users', user.uid);
          let finalRole: UserRole = isAdminUser ? 'admin' : 'colaborador';
          let displayName = user.displayName || (isAdminUser ? 'Administrador Karen' : 'Colaborador');
          let isActive = true;

          try {
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
              const data = userSnap.data();
              finalRole = isAdminUser ? 'admin' : ((data.role as UserRole) || finalRole);
              displayName = data.displayName || displayName;
              isActive = data.active !== false;
            } else {
              const newProfile: AppUser = {
                uid: user.uid,
                email: user.email || '',
                displayName,
                role: finalRole,
                active: true,
                createdAt: new Date().toISOString(),
              };
              await setDoc(userDocRef, newProfile);
            }
          } catch (e) {
            console.warn('Verificación de perfil de usuario:', e);
          }

          if (!isActive && !isPrimaryAdmin) {
            await signOut(auth);
            setCurrentUser(null);
            setAppUser(null);
            setRole(null);
            setLoading(false);
            return;
          }

          const resolvedProfile: AppUser = {
            uid: user.uid,
            email: user.email || '',
            displayName,
            role: finalRole,
            active: isActive,
          };

          setAppUser(resolvedProfile);
          setRole(finalRole);
        } catch (error) {
          console.error('Error cargando perfil de usuario desde Firestore:', error);
          setAppUser(null);
          setRole(null);
        }
      } else {
        setAppUser(null);
        setRole(null);
        setUsersList([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to users list when logged in as admin
  useEffect(() => {
    if (!currentUser || role !== 'admin') {
      setUsersList([]);
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

    return () => unsubUsers();
  }, [currentUser, role]);

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error al autenticar con Google:', error);
      throw error;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (error) {
      console.error('Error al iniciar sesión con correo:', error);
      throw error;
    }
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

    const cleanEmail = email.trim();
    const cleanName = displayName.trim();

    try {
      // Use a secondary Firebase App instance so creating the user does not sign out the active Administrator
      const secondaryAppName = 'StaffAccountCreatorApp';
      const existingSecondary = getApps().find(a => a.name === secondaryAppName);
      const secondaryApp = existingSecondary || initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);

      const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, pass);
      const newUser = cred.user;
      await signOut(secondaryAuth);

      const nowIso = new Date().toISOString();

      // Create /users/{uid} using the active Admin's Firestore session
      await setDoc(doc(db, 'users', newUser.uid), {
        uid: newUser.uid,
        email: cleanEmail,
        displayName: cleanName,
        role: targetRole,
        active: true,
        createdAt: nowIso,
      });

      // If admin, also create /admins/{uid}
      if (targetRole === 'admin') {
        await setDoc(doc(db, 'admins', newUser.uid), {
          email: cleanEmail,
          addedAt: nowIso,
        });
      }

      // Record audit log
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
    } catch (error) {
      console.error('Error al registrar cuenta de colaborador/administrador:', error);
      throw error;
    }
  };

  const updateUserRole = async (targetUid: string, newRole: UserRole, email: string) => {
    if (role !== 'admin') {
      throw new Error('Solo un administrador puede modificar roles de usuarios.');
    }
    if (email && email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase() && newRole !== 'admin') {
      throw new Error('Por seguridad, no se puede degradar la cuenta del Administrador Principal.');
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
        await deleteDoc(doc(db, 'admins', targetUid));
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
    try {
      await signOut(auth);
      setCurrentUser(null);
      setAppUser(null);
      setRole(null);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      throw error;
    }
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
        usersList,
        loginWithGoogle,
        loginWithEmail,
        createStaffAccount,
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
