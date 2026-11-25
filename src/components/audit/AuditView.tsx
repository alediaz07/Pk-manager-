import React, { useRef, useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { formatDateTime } from '../../utils/formatters';
import { BackupValidationResult } from '../../utils/backupManager';
import {
  Lock,
  Download,
  UploadCloud,
  Loader2,
  Users,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  X,
  ShieldCheck,
  MailCheck,
  Trash2,
} from 'lucide-react';

export const AuditView: React.FC = () => {
  const { auditLogs, exportDataBackup, previewDataBackup, restoreDataBackup } = usePOS();
  const {
    isAdmin,
    usersList,
    userInvites,
    createStaffAccount,
    createUserInvite,
    revokeUserInvite,
    updateUserRole,
    toggleUserActive,
  } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRestoring, setIsRestoring] = useState(false);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<{
    name: string;
    content: string;
    preview: BackupValidationResult;
  } | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create Staff Account Modal State
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('colaborador');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Pre-authorized Google Invite State
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'colaborador' | 'cocina'>('colaborador');

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-100">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-md border border-gray-200">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-gray-900">Acceso Restringido</h2>
          <p className="text-xs text-gray-500 mt-2">
            El registro de auditoría, respaldos y administración de cuentas está reservado para Administradores.
          </p>
        </div>
      </div>
    );
  }

  const showBanner = (type: 'success' | 'error', text: string) => {
    setBanner({ type, text });
    setTimeout(() => {
      setBanner(prev => (prev?.text === text ? null : prev));
    }, 6000);
  };

  const handleDownloadBackup = () => {
    try {
      const jsonBackup = exportDataBackup();
      const blob = new Blob([jsonBackup], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `respaldo_pollos_karen_${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showBanner('success', 'Respaldo JSON sanitizado generado (sin secretos ni credenciales).');
    } catch (err: any) {
      showBanner('error', `Error al generar respaldo: ${err?.message || 'Error desconocido'}`);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const preview = previewDataBackup(text);
      setPendingRestoreFile({ name: file.name, content: text, preview });
    } catch (err: any) {
      showBanner('error', `Error leyendo archivo: ${err?.message || 'Archivo inválido'}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreFile || !pendingRestoreFile.preview.valid) return;
    setIsRestoring(true);
    try {
      const res = await restoreDataBackup(pendingRestoreFile.content);
      setPendingRestoreFile(null);
      showBanner(res.success ? 'success' : 'error', res.message);
    } catch (err: any) {
      showBanner('error', err?.message || 'Error al restaurar respaldo.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newPassword.trim() || !newDisplayName.trim()) return;
    setIsCreatingUser(true);
    try {
      await createStaffAccount(newEmail, newPassword, newDisplayName, newRole);
      setNewEmail('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('colaborador');
      setIsCreateUserOpen(false);
      showBanner('success', `Cuenta creada exitosamente para ${newDisplayName} (${newRole.toUpperCase()}).`);
    } catch (err: any) {
      showBanner('error', err?.message || 'Error al crear la cuenta.');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUserInvite(inviteEmail, inviteName, inviteRole);
      setInviteEmail('');
      setInviteName('');
      showBanner('success', `Correo preautorizado para iniciar con Google (${inviteRole.toUpperCase()}).`);
    } catch (err: any) {
      showBanner('error', err?.message || 'Error creando preautorización.');
    }
  };

  const handleRoleChange = async (uid: string, targetRole: UserRole, email: string) => {
    try {
      await updateUserRole(uid, targetRole, email);
      showBanner('success', `Rol de ${email} actualizado a ${targetRole.toUpperCase()}.`);
    } catch (err: any) {
      showBanner('error', err?.message || 'No se pudo cambiar el rol.');
    }
  };

  const handleToggleActive = async (uid: string, currentActive: boolean) => {
    try {
      await toggleUserActive(uid, currentActive);
      showBanner('success', 'Estado de cuenta actualizado con revocación en tiempo real.');
    } catch (err: any) {
      showBanner('error', err?.message || 'No se pudo actualizar el estado.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-100 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Backup & Restore */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl shadow-xs border border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md">
                Seguridad, Usuarios (3 Roles) &amp; Respaldos
              </span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">
              Bitácora de Auditoría y Control de Acceso
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Gestione cuentas de Administrador, Colaborador y Cocina (KDS), preautorice correos de Google y administre respaldos por lotes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".json,application/json"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isRestoring}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              {isRestoring ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
              ) : (
                <UploadCloud className="w-4 h-4 text-gray-600" />
              )}
              <span>Restaurar Copia</span>
            </button>

            <button
              onClick={handleDownloadBackup}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Descargar Respaldo JSON</span>
            </button>
          </div>
        </div>

        {banner && (
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-bold ${
              banner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{banner.text}</span>
            </div>
            <button onClick={() => setBanner(null)} className="text-gray-400 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* User & Role Management Panel */}
        <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-black text-base text-gray-900">
                  Cuentas de Personal Activas (Admin / Colaborador / Cocina)
                </h2>
                <p className="text-xs text-gray-500">
                  Cualquier persona no registrada o suspendida es bloqueada inmediatamente al intentar ingresar.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCreateUserOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-gray-900 hover:bg-black text-white text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Crear Cuenta con Contraseña</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Nombre</th>
                  <th className="py-2.5 px-3">Correo</th>
                  <th className="py-2.5 px-3">Rol Asignado</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usersList.map(u => {
                  const isPrimary = u.email?.toLowerCase() === 'alejandrodiazortiz07@gmail.com';
                  return (
                    <tr key={u.uid} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-bold text-gray-900">
                        {u.displayName}{' '}
                        {isPrimary && (
                          <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-black">
                            Principal
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">{u.email}</td>
                      <td className="py-2.5 px-3">
                        {isPrimary ? (
                          <span className="px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase bg-red-100 text-red-800">
                            Administrador
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={e => handleRoleChange(u.uid, e.target.value as UserRole, u.email)}
                            className="px-2 py-1 rounded-lg border border-gray-300 bg-white font-bold text-[11px]"
                          >
                            <option value="admin">Administrador</option>
                            <option value="colaborador">Colaborador</option>
                            <option value="cocina">Cocina (KDS)</option>
                          </select>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            u.active !== false
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {u.active !== false ? 'Activo' : 'Suspendido'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {!isPrimary && (
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u.uid, u.active !== false)}
                            className={`px-2.5 py-1 rounded-xl font-bold text-[11px] cursor-pointer ${
                              u.active !== false
                                ? 'bg-red-50 hover:bg-red-100 text-red-700'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {u.active !== false ? 'Suspender' : 'Reactivar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pre-authorized Google Invites */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <h3 className="text-xs font-black text-gray-800 flex items-center gap-1.5">
              <MailCheck className="w-4 h-4 text-red-600" />
              <span>Preautorizar Acceso con Google (Sin autoregistro público)</span>
            </h3>
            <form onSubmit={handleCreateInvite} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
              <input
                type="text"
                required
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="Nombre del personal"
                className="px-3 py-2 rounded-xl border border-gray-300"
              />
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="correo.google@gmail.com"
                className="px-3 py-2 rounded-xl border border-gray-300"
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as 'colaborador' | 'cocina')}
                className="px-3 py-2 rounded-xl border border-gray-300 bg-white font-bold"
              >
                <option value="colaborador">Colaborador (Salón/Caja)</option>
                <option value="cocina">Cocina (KDS)</option>
              </select>
              <button
                type="submit"
                className="py-2 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
              >
                Autorizar Correo
              </button>
            </form>

            {userInvites.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {userInvites.map(inv => (
                  <div
                    key={inv.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-[11px]"
                  >
                    <span className="font-bold text-gray-800">{inv.email}</span>
                    <span className="uppercase font-black text-red-600">{inv.role}</span>
                    <button
                      type="button"
                      onClick={() => revokeUserInvite(inv.email)}
                      className="text-gray-400 hover:text-red-600 cursor-pointer"
                      title="Revocar invitación"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Audit Table */}
        <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-red-600" />
            <h3 className="font-black text-base text-gray-900">Eventos Registrados en Bitácora</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Fecha y Hora</th>
                  <th className="py-2.5 px-3">Acción</th>
                  <th className="py-2.5 px-3">Módulo</th>
                  <th className="py-2.5 px-3">Motivo</th>
                  <th className="py-2.5 px-3">Usuario</th>
                  <th className="py-2.5 px-3">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">
                      No se han registrado modificaciones auditadas aún.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                        {formatDateTime(log.timestamp)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-red-100 text-red-800 uppercase">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-gray-700">{log.collection}</td>
                      <td className="py-2.5 px-3 font-bold text-gray-900">{log.reason}</td>
                      <td className="py-2.5 px-3 text-gray-600">{log.performedBy}</td>
                      <td className="py-2.5 px-3 text-gray-500 text-[11px]">{log.details || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal: Validated Chunked Restore Confirmation */}
      {pendingRestoreFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <h3 className="font-black text-lg text-gray-900">
              Validación de Respaldo antes de Restaurar
            </h3>
            <p className="text-gray-600">
              Archivo: <strong className="text-gray-900">{pendingRestoreFile.name}</strong>
            </p>

            {pendingRestoreFile.preview.valid ? (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
                <div className="font-bold text-emerald-900">
                  Respaldo válido: {pendingRestoreFile.preview.totalDocuments} documentos listos (lotes seguros ≤400).
                </div>
                <div className="text-[11px] text-emerald-800">
                  {Object.entries(pendingRestoreFile.preview.collectionCounts)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' • ')}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-800 font-bold">
                {pendingRestoreFile.preview.errors.join(' ')}
              </div>
            )}

            {pendingRestoreFile.preview.warnings.length > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                {pendingRestoreFile.preview.warnings.join(' ')}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingRestoreFile(null)}
                disabled={isRestoring}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isRestoring || !pendingRestoreFile.preview.valid}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md disabled:opacity-40 cursor-pointer"
              >
                {isRestoring ? 'Restaurando...' : 'Restaurar Ahora'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Staff Account (3 Roles) */}
      {isCreateUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleCreateUserSubmit}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="font-black text-lg text-gray-900">Nueva Cuenta de Personal</h3>
              <button
                type="button"
                onClick={() => setIsCreateUserOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Nombre Completo</label>
              <input
                type="text"
                required
                value={newDisplayName}
                onChange={e => setNewDisplayName(e.target.value)}
                placeholder="Ej. Carlos Mora (Cocina)"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 font-semibold"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Correo Electrónico</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="cocina@polloskaren.cr"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Contraseña Segura</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="8+ chars (letras y números)"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Rol en el Sistema</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white font-bold"
                >
                  <option value="colaborador">Colaborador (Salón/Caja)</option>
                  <option value="cocina">Cocina (Solo KDS)</option>
                  <option value="admin">Administrador (Total)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3">
              <button
                type="button"
                onClick={() => setIsCreateUserOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isCreatingUser}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md cursor-pointer"
              >
                {isCreatingUser ? 'Creando...' : 'Crear Cuenta'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
