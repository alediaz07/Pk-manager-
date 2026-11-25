import React, { useRef, useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { formatDateTime } from '../../utils/formatters';
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
} from 'lucide-react';

export const AuditView: React.FC = () => {
  const { auditLogs, exportDataBackup, restoreDataBackup } = usePOS();
  const { isAdmin, usersList, createStaffAccount, updateUserRole, toggleUserActive } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRestoring, setIsRestoring] = useState(false);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<{ name: string; content: string } | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create Staff Account Modal State
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('colaborador');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-100">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-md border border-gray-200">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-gray-900">Acceso Restringido</h2>
          <p className="text-xs text-gray-500 mt-2">
            El registro de auditoría de seguridad, respaldos y administración de cuentas está reservado para Administradores.
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
      showBanner('success', 'Respaldo JSON generado y descargado correctamente.');
    } catch (err: any) {
      showBanner('error', `Error al generar el respaldo: ${err?.message || 'Error desconocido'}`);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setPendingRestoreFile({ name: file.name, content: text });
    } catch (err: any) {
      showBanner('error', `Error leyendo archivo: ${err?.message || 'Archivo inválido'}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreFile) return;
    setIsRestoring(true);
    try {
      const res = await restoreDataBackup(pendingRestoreFile.content);
      setPendingRestoreFile(null);
      showBanner('success', res.message);
    } catch (err: any) {
      showBanner('error', `Error al restaurar el respaldo: ${err?.message || 'Error en formato de datos'}`);
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
      showBanner('error', err?.message || 'Error al crear la cuenta de usuario.');
    } finally {
      setIsCreatingUser(false);
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
      showBanner('success', `Estado de cuenta actualizado correctamente.`);
    } catch (err: any) {
      showBanner('error', err?.message || 'No se pudo actualizar el estado de la cuenta.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-100 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Backup & Restore actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl shadow-xs border border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md">
                Trazabilidad, Usuarios & Seguridad
              </span>
              <span className="text-xs text-gray-500 font-medium">Registro Inmutable</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">Bitácora de Auditoría y Control de Acceso</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Gestione cuentas de personal (Administradores y Colaboradores), respaldos y revise la bitácora inmutable.
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
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition disabled:opacity-50"
              title="Restaurar base de datos desde un archivo JSON"
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
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs transition"
              title="Descargar copia de seguridad completa del restaurante"
            >
              <Download className="w-4 h-4" />
              <span>Descargar Respaldo JSON</span>
            </button>
          </div>
        </div>

        {/* Status Banner */}
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
                  Gestión de Cuentas y Roles (Administradores y Colaboradores)
                </h2>
                <p className="text-xs text-gray-500">
                  Cree cuentas para el personal o asigne permisos de Administrador / Colaborador sin cerrar su sesión actual.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCreateUserOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-gray-900 hover:bg-black text-white text-xs font-bold shadow-xs transition"
            >
              <UserPlus className="w-4 h-4" />
              <span>Registrar Cuenta de Personal</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Nombre</th>
                  <th className="py-2.5 px-3">Correo Electrónico</th>
                  <th className="py-2.5 px-3">Rol Asignado</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3 text-right">Acciones de Rol y Acceso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usersList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400">
                      No hay usuarios registrados en la colección.
                    </td>
                  </tr>
                ) : (
                  usersList.map(u => {
                    const isPrimary = u.email?.toLowerCase() === 'alejandrodiazortiz07@gmail.com';
                    return (
                      <tr key={u.uid} className="hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-bold text-gray-900 flex items-center gap-1.5">
                          <span>{u.displayName}</span>
                          {isPrimary && (
                            <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-black">
                              Principal
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">{u.email}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                              u.role === 'admin'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {u.role === 'admin' ? 'Administrador' : 'Colaborador'}
                          </span>
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
                        <td className="py-2.5 px-3 text-right space-x-2">
                          {!isPrimary && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRoleChange(
                                    u.uid,
                                    u.role === 'admin' ? 'colaborador' : 'admin',
                                    u.email
                                  )
                                }
                                className="px-2.5 py-1 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-[11px] transition"
                              >
                                {u.role === 'admin' ? 'Cambiar a Colaborador' : 'Promover a Admin'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleActive(u.uid, u.active !== false)}
                                className={`px-2.5 py-1 rounded-xl font-bold text-[11px] transition ${
                                  u.active !== false
                                    ? 'bg-red-50 hover:bg-red-100 text-red-700'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {u.active !== false ? 'Suspender' : 'Reactivar'}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
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
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Fecha y Hora</th>
                  <th className="py-2.5 px-3">Acción</th>
                  <th className="py-2.5 px-3">Módulo</th>
                  <th className="py-2.5 px-3">Motivo / Razón</th>
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
                      <td className="py-2.5 px-3 font-semibold text-gray-700 capitalize">
                        {log.collection}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-gray-900">{log.reason}</td>
                      <td className="py-2.5 px-3 text-gray-600">
                        {log.performedBy}
                        {log.performedByEmail && (
                          <div className="text-[10px] text-gray-400 truncate max-w-[150px]">
                            {log.performedByEmail}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-500 text-[11px]">{log.details || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal: Restore Backup Confirmation */}
      {pendingRestoreFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-black text-lg text-gray-900">Confirmar Restauración de Respaldo</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              ¿Está seguro de que desea restaurar los datos desde el archivo{' '}
              <strong className="text-gray-900">"{pendingRestoreFile.name}"</strong>? Esta operación importará productos,
              categorías, mesas, inventarios y recetas al sistema y dejará constancia en la bitácora de auditoría.
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingRestoreFile(null)}
                disabled={isRestoring}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md"
              >
                {isRestoring ? 'Restaurando...' : 'Confirmar Restauración'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Staff / Admin Account */}
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
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
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
                placeholder="Ej. María Vargas (Salón)"
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
                placeholder="correo@polloskaren.cr"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Contraseña Inicial</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
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
                  <option value="colaborador">Colaborador (POS / Mesas / Caja)</option>
                  <option value="admin">Administrador (Acceso Total)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3">
              <button
                type="button"
                onClick={() => setIsCreateUserOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isCreatingUser}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md"
              >
                {isCreatingUser ? 'Creando Cuenta...' : 'Crear Cuenta'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
