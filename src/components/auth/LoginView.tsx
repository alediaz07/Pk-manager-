import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Shield,
  UserCheck,
  ChefHat,
  Lock,
  Mail,
  KeyRound,
  LogIn,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const {
    loginWithGoogle,
    loginWithEmail,
    sendPasswordReset,
    authBlockedMessage,
    clearAuthBlockedMessage,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showArchitectureHelp, setShowArchitectureHelp] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number>(0);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  useEffect(() => {
    if (!lockoutUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutUntil(0);
        setLockoutSeconds(0);
        setFailedAttempts(0);
      } else {
        setLockoutSeconds(remaining);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const displayedError = authBlockedMessage || errorMessage;

  const handleGoogleLogin = async () => {
    if (lockoutSeconds > 0) return;
    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    clearAuthBlockedMessage();
    try {
      await loginWithGoogle();
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMessage('Ventana de Google cerrada antes de completar el acceso.');
      } else {
        setErrorMessage(
          'No fue posible iniciar sesión con Google. Verifique que las ventanas emergentes estén habilitadas.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || lockoutSeconds > 0) return;

    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    clearAuthBlockedMessage();
    try {
      await loginWithEmail(email.trim(), password);
      setFailedAttempts(0);
    } catch (err: any) {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      if (nextAttempts >= 5) {
        const until = Date.now() + 30_000;
        setLockoutUntil(until);
        setLockoutSeconds(30);
        setErrorMessage(
          'Demasiados intentos fallidos. Por seguridad espere 30 segundos antes de intentar nuevamente.'
        );
      } else if (err?.code === 'auth/operation-not-allowed') {
        setErrorMessage(
          'El proveedor de Correo/Contraseña no está habilitado en Firebase Authentication.'
        );
      } else if (
        err?.code === 'auth/user-not-found' ||
        err?.code === 'auth/wrong-password' ||
        err?.code === 'auth/invalid-credential'
      ) {
        setErrorMessage('Credenciales incorrectas. Verifique su correo y contraseña.');
      } else if (err?.code === 'auth/too-many-requests') {
        setErrorMessage(
          'Acceso temporalmente bloqueado por múltiples intentos fallidos. Intente más tarde o restablezca su contraseña.'
        );
      } else {
        setErrorMessage('Error al autenticar usuario. Verifique sus credenciales.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    if (!email.trim()) {
      setErrorMessage('Escriba primero su correo electrónico en el campo de arriba para enviar el enlace de recuperación.');
      return;
    }
    setIsLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setInfoMessage(
        'Si el correo corresponde a una cuenta registrada, recibirá un enlace para restablecer su contraseña.'
      );
    } catch {
      setInfoMessage(
        'Si el correo corresponde a una cuenta registrada, recibirá un enlace para restablecer su contraseña.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-600 via-red-700 to-red-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-7 md:p-8 border border-white/20 text-gray-900">
        {/* Logo and Brand */}
        <div className="text-center space-y-2 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-red-600 text-white flex items-center justify-center mx-auto shadow-lg p-2.5">
            <img src="/icon.svg" alt="Pollos Karen" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-wide text-gray-950 uppercase">
              POLLOS KAREN
            </h1>
            <p className="text-xs font-semibold text-red-600">
              Sistema Interno de Gestión &amp; Punto de Venta
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 text-[11px] font-bold border border-red-200">
            <Lock className="w-3 h-3" />
            <span>Acceso Restringido a Personal Autorizado</span>
          </div>
        </div>

        {displayedError && (
          <div className="mb-4 bg-red-50 border border-red-200 p-3.5 rounded-2xl text-xs text-red-800 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Acceso Denegado</div>
              <div className="text-[11px] mt-0.5">{displayedError}</div>
            </div>
          </div>
        )}

        {infoMessage && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl text-xs text-emerald-800 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-[11px]">{infoMessage}</div>
          </div>
        )}

        <div className="space-y-4">
          <button
            type="button"
            disabled={isLoading || lockoutSeconds > 0}
            onClick={handleGoogleLogin}
            className="w-full py-3.5 px-4 bg-white hover:bg-gray-50 active:bg-gray-100 border-2 border-gray-200 hover:border-gray-300 text-gray-800 font-bold rounded-2xl text-sm shadow-xs transition flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Iniciar con Google Autorizado</span>
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 border-t border-gray-200"></div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              O con credenciales
            </span>
            <div className="flex-1 border-t border-gray-200"></div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="usuario@polloskaren.com"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-gray-700">Contraseña</label>
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={isLoading}
                  className="text-[11px] font-semibold text-red-600 hover:text-red-700 cursor-pointer"
                >
                  ¿Olvidó su contraseña?
                </button>
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || lockoutSeconds > 0}
              className="w-full py-3 bg-red-600 hover:bg-red-700 active:scale-98 text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {lockoutSeconds > 0
                  ? `Espere ${lockoutSeconds}s...`
                  : isLoading
                    ? 'Verificando...'
                    : 'Entrar al Sistema'}
              </span>
            </button>
          </form>
        </div>

        {/* Roles & Security Architecture Guide Toggle */}
        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <button
            type="button"
            onClick={() => setShowArchitectureHelp(!showArchitectureHelp)}
            className="text-xs font-bold text-gray-500 hover:text-red-600 inline-flex items-center gap-1.5 transition cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Ver roles del sistema</span>
          </button>

          {showArchitectureHelp && (
            <div className="mt-3 p-3.5 bg-gray-50 rounded-2xl border border-gray-200 text-left text-xs space-y-2.5 text-gray-700">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-gray-900">Administrador:</span>
                  <p className="text-[11px] text-gray-600">
                    Control completo de finanzas, inventario, costos, compras, proveedores, usuarios, configuración y auditoría.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 pt-1.5 border-t border-gray-200">
                <UserCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-gray-900">Colaborador (Salón / Caja):</span>
                  <p className="text-[11px] text-gray-600">
                    Toma de pedidos, mesas, cobro en caja e impresión de comandas y comprobantes internos. Sin acceso a costos ni finanzas.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 pt-1.5 border-t border-gray-200">
                <ChefHat className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-gray-900">Cocina (KDS):</span>
                  <p className="text-[11px] text-gray-600">
                    Pantalla exclusiva de comandas autorizadas y estado de preparación. Sin acceso a precios, cobros ni caja.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
