import React, { useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { LogOut, User, DollarSign } from 'lucide-react';

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);

  return (
    <nav className="flex h-16 items-center justify-between border-b border-borderBg bg-cardBg px-6">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-primary-600 to-primary-400 text-white font-bold text-xl shadow-lg shadow-primary-500/20">
          SB
        </div>
        <span className="text-xl font-bold tracking-tight text-white bg-clip-text">
          Split<span className="text-primary-500">Buddy</span>
        </span>
      </div>

      {user && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg bg-darkBg px-3 py-1.5 border border-borderBg">
            <User className="h-4 w-4 text-primary-500" />
            <span className="text-sm font-medium text-slate-300">{user.name}</span>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 border border-red-500/20 transition-all hover:bg-red-500 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
