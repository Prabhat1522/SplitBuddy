import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import Navbar from '../components/layout/Navbar';
import { Plus, Users, ArrowUpRight, ArrowDownRight, Wallet, ChevronRight, X, Info } from 'lucide-react';

const Dashboard = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const fetchGroups = async () => {
    try {
      setError('');
      const res = await api.get('/groups');
      setGroups(res.data.groups);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch groups. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setIsCreating(true);
    try {
      await api.post('/groups', {
        name: newGroupName,
        description: newGroupDesc
      });
      setNewGroupName('');
      setNewGroupDesc('');
      setShowModal(false);
      fetchGroups(); // Refresh group list
    } catch (err) {
      console.error(err);
      alert('Failed to create group. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  // Calculate totals
  const totalOwed = groups.reduce((sum, g) => g.userBalance < 0 ? sum + Math.abs(g.userBalance) : sum, 0);
  const totalOwedToYou = groups.reduce((sum, g) => g.userBalance > 0 ? sum + g.userBalance : sum, 0);
  const netBalance = totalOwedToYou - totalOwed;

  return (
    <div className="min-h-screen bg-darkBg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        {/* Dashboard Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">Real-time overview of your shared expenses and groups</p>
          </div>
          
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-600/20 transition-all"
          >
            <Plus className="h-5 w-5" />
            <span>Create New Group</span>
          </button>
        </div>

        {/* Global Balance Summary Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="rounded-2xl border border-borderBg bg-cardBg/40 p-6 backdrop-blur-md flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Net Balance</p>
              <h3 className={`text-2xl font-bold mt-2 ${netBalance > 0 ? 'text-primary-500' : netBalance < 0 ? 'text-red-400' : 'text-slate-300'}`}>
                {netBalance > 0 ? `+$${netBalance.toFixed(2)}` : netBalance < 0 ? `-$${Math.abs(netBalance).toFixed(2)}` : '$0.00'}
              </h3>
            </div>
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${netBalance > 0 ? 'bg-primary-500/10 text-primary-400' : netBalance < 0 ? 'bg-red-400/10 text-red-400' : 'bg-slate-700/10 text-slate-400'}`}>
              <Wallet className="h-6 w-6" />
            </div>
          </div>

          <div className="rounded-2xl border border-borderBg bg-cardBg/40 p-6 backdrop-blur-md flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">You Owe</p>
              <h3 className="text-2xl font-bold mt-2 text-red-400">${totalOwed.toFixed(2)}</h3>
            </div>
            <div className="h-12 w-12 rounded-xl bg-red-400/10 text-red-400 flex items-center justify-center">
              <ArrowDownRight className="h-6 w-6" />
            </div>
          </div>

          <div className="rounded-2xl border border-borderBg bg-cardBg/40 p-6 backdrop-blur-md flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">You Are Owed</p>
              <h3 className="text-2xl font-bold mt-2 text-primary-500">${totalOwedToYou.toFixed(2)}</h3>
            </div>
            <div className="h-12 w-12 rounded-xl bg-primary-500/10 text-primary-400 flex items-center justify-center">
              <ArrowUpRight className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Groups List Section */}
        <div className="rounded-2xl border border-borderBg bg-cardBg/20 p-6 backdrop-blur-md">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary-500" />
            <span>My Groups ({groups.length})</span>
          </h2>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-primary-500"></div>
              <p className="text-sm text-slate-400 mt-4">Fetching groups...</p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
              <Info className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-borderBg rounded-xl px-4 text-center">
              <Users className="h-12 w-12 text-slate-600 mb-4" />
              <h3 className="font-semibold text-slate-300 text-lg">No groups yet</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">Create a group to start adding and splitting expenses with friends.</p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-5 rounded-lg bg-primary-600 hover:bg-primary-500 px-4 py-2.5 text-xs font-semibold text-white transition-all"
              >
                Create Group
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groups.map((group) => {
                const bal = group.userBalance;
                return (
                  <div
                    key={group.id}
                    onClick={() => navigate(`/group/${group.id}`)}
                    className="group flex items-center justify-between rounded-xl border border-borderBg bg-cardBg/40 p-5 cursor-pointer transition-all hover:bg-cardBg hover:border-slate-700"
                  >
                    <div className="flex-1 pr-4">
                      <h3 className="font-bold text-white group-hover:text-primary-400 transition-colors text-base">
                        {group.name}
                      </h3>
                      <p className="text-slate-400 text-xs mt-1 line-clamp-1">
                        {group.description || 'No description provided.'}
                      </p>
                      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                        <span>Created by {group.creator?.name || 'Unknown'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        {bal > 0 ? (
                          <>
                            <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">You are owed</p>
                            <p className="text-sm font-bold text-primary-500 mt-0.5">${bal.toFixed(2)}</p>
                          </>
                        ) : bal < 0 ? (
                          <>
                            <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">You owe</p>
                            <p className="text-sm font-bold text-red-400 mt-0.5">${Math.abs(bal).toFixed(2)}</p>
                          </>
                        ) : (
                          <span className="inline-block rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Settled
                          </span>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-primary-500 transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Create Group Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-darkBg/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-borderBg bg-cardBg p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-borderBg pb-4 mb-5">
              <h2 className="text-lg font-bold text-white">Create New Group</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-darkBg hover:text-white transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Group Name
                </label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Apartment, Road Trip 2026"
                  className="w-full rounded-xl border border-borderBg bg-darkBg px-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition-all focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Description (Optional)
                </label>
                <textarea
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="What is this group for?"
                  rows="3"
                  className="w-full rounded-xl border border-borderBg bg-darkBg px-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition-all focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-borderBg mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-borderBg bg-darkBg px-4 py-2.5 text-sm font-semibold text-slate-300 hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex items-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-50"
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
