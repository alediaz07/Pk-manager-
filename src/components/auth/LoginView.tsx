import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Shield,
  UserCheck,
  Lock,
  Mail,
  KeyRound,
  LogIn,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const { loginWithGoogle, loginWithEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showArchitectureHelp, setShowArchitectureHelp] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(
        err.message || 'No fue posible iniciar sesión con Google. Verifique la ventana emergente.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setIsLoading(true);
    setErrorMessage(null);
    try {
      await loginWithEmail(email.trim(), password);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setErrorMessage(
          'El proveedor de Correo/Contraseña debe habilitarse en la consola de Firebase (Authentication > Sign-in method > Correo electrónico/contraseña).'
        );
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorMessage('Credenciales incorrectas. Verifique el correo y la contraseña.');
      } else {
        setErrorMessage(err.message || 'Error al autenticar usuario.');
      }
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
              Sistema de Gestión Integral & Punto de Venta
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 text-[11px] font-bold border border-red-200">
            <Lock className="w-3 h-3" />
            <span>Autenticación de Seguridad Requerida</span>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-5 bg-red-50 border border-red-200 p-3.5 rounded-2xl text-xs text-red-800 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Error de Acceso</div>
              <div className="text-[11px] mt-0.5">{errorMessage}</div>
            </div>
          </div>
        )}

        {/* Google Authentication Button (1-Click, fully provisioned) */}
        <div className="space-y-4">
          <button
            type="button"
            disabled={isLoading}
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
            <span>Iniciar con Google (Recomendado)</span>
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 border-t border-gray-200"></div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              O con credenciales
            </span>
            <div className="flex-1 border-t border-gray-200"></div>
          </div>

          {/* Email / Password Form for Staff / Colaborador */}
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
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="ej. colaborador@polloskaren.com"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Contraseña
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-red-600 hover:bg-red-700 active:scale-98 text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{isLoading ? 'Verificando...' : 'Entrar al Sistema'}</span>
            </button>
          </form>
        </div>

        {/* Roles & Security Architecture Guide Toggle */}
        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <button
            type="button"
            onClick={() => setShowArchitectureHelp(!showArchitectureHelp)}
            className="text-xs font-bold text-gray-500 hover:text-red-600 inline-flex items-center gap-1.5 transition"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Ver arquitectura de roles y cuentas</span>
          </button>

          {showArchitectureHelp && (
            <div className="mt-3 p-3.5 bg-gray-50 rounded-2xl border border-gray-200 text-left text-xs space-y-2 text-gray-700 animate-in fade-in">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-gray-900">3 Cuentas Administrador:</span>
                  <p className="text-[11px] text-gray-600">
                    Administrador principal ({PRIMARY_ADMIN_EMAIL}) y 2 administradores delegados. Acceso irrestricto a finanzas, inventario, precios, compras y auditoría.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 pt-1 border-t border-gray-200">
                <UserCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-gray-900">1 Cuenta Colaborador:</span>
                  <p className="text-[11px] text-gray-600">
                    Cuenta compartida para atención de salón, pedidos, cobro en caja e impresión de tickets. Restricción absoluta de costos y reportes financieros.
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

const PRIMARY_ADMIN_EMAIL = 'alejandrodiazortiz07@gmail.com';
