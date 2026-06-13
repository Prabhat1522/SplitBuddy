import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/layout/Navbar';
import { Plus, Users, Search, ChevronRight, X } from 'lucide-react';

const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const navigate = useNavigate();

  const fetchGroups = async () => {
    try {
      const res = await api.get('/groups');
      setGroups(res.data.groups);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      await api.post('/groups', { name, description });
      setName('');
      setDescription('');
      setShowModal(false);
      fetchGroups();
    } catch (err) {
      console.error(err);
      alert('Failed to create group.');
    } finally {
      setSaving(false);
    }
  };

  const filteredGroups = groups.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (g.description && g.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-darkBg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">My Groups</h1>
            <p className="text-slate-400 text-sm mt-1">Manage and view your expense sharing groups</p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-500 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all"
          >
            <Plus className="h-5 w-5" />
            <span>Create New Group</span>
          </button>
        </div>

        {/* Search Filter */}
        <div className="relative mb-6">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
            <Search className="h-5 w-5" />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search groups by name or description..."
            className="w-full rounded-xl border border-borderBg bg-cardBg/40 pl-11 pr-4 py-3.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-all focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </div>

        {/* Groups Display Grid */}
        <div className="rounded-2xl border border-borderBg bg-cardBg/20 p-6 backdrop-blur-md">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-primary-500"></div>
              <p className="text-sm text-slate-400 mt-4">Loading groups...</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-12 w-12 text-slate-600 mb-4" />
              <h3 className="font-semibold text-slate-300 text-lg">No groups found</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">Try modifying your search or create a new group to start sharing costs.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGroups.map(group => {
                const bal = group.userBalance;
                return (
                  <div
                    key={group.id}
                    onClick={() => navigate(`/group/${group.id}`)}
                    className="group flex items-center justify-between rounded-xl border border-borderBg bg-cardBg/40 p-5 cursor-pointer transition-all hover:bg-cardBg hover:border-slate-700"
                  >
                    <div>
                      <h3 className="font-bold text-white group-hover:text-primary-400 transition-colors text-base">
                        {group.name}
                      </h3>
                      <p className="text-slate-400 text-xs mt-1 line-clamp-1">
                        {group.description || 'No description.'}
                      </p>
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
          <div className="w-full max-w-md rounded-2xl border border-borderBg bg-cardBg p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-borderBg pb-4 mb-5">
              <h2 className="text-lg font-bold text-white">Create New Group</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-darkBg hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Group Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ski Trip, Rent Split"
                  className="w-full rounded-xl border border-borderBg bg-darkBg px-4 py-3 text-sm text-slate-200 outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this group for?"
                  rows="3"
                  className="w-full rounded-xl border border-borderBg bg-darkBg px-4 py-3 text-sm text-slate-200 outline-none focus:border-primary-500 resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-borderBg mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-borderBg bg-darkBg px-4 py-2.5 text-sm font-semibold text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-primary-600 hover:bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Groups;
