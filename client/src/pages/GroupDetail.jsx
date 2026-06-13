import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import Navbar from '../components/layout/Navbar';
import { 
  ArrowLeft, Plus, DollarSign, Calendar, CheckCircle, 
  Trash2, Edit3, Upload, UserPlus, Info, Check, HelpCircle, 
  Clock, X, AlertCircle, FileText 
} from 'lucide-react';

const GroupDetail = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  // Core data states
  const [group, setGroup] = useState(null);
  const [activeMembers, setActiveMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [balances, setBalances] = useState([]);
  const [simplifiedDebts, setSimplifiedDebts] = useState([]);
  const [reports, setReports] = useState([]);
  const [membershipHistory, setMembershipHistory] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('expenses'); // 'expenses', 'settlements', 'balances', 'reports', 'history'

  // Modals visibility state
  const [memberModalOpen, setMemberModalOpen] = useState(false);

  // Add Member Form state
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [memberError, setMemberError] = useState('');
  const [memberSaving, setMemberSaving] = useState(false);

  // Fetch all group details
  const fetchGroupDetails = async () => {
    try {
      setError('');
      const res = await api.get(`/groups/${groupId}`);
      const { group, activeMembers, expenses, settlements, balances, simplifiedDebts } = res.data;
      setGroup(group);
      setActiveMembers(activeMembers);
      setExpenses(expenses);
      setSettlements(settlements);
      setBalances(balances);
      setSimplifiedDebts(simplifiedDebts);
    } catch (err) {
      console.error(err);
      setError('Failed to load group details. Make sure you are a member of this group.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembershipHistory = async () => {
    try {
      const res = await api.get(`/groups/${groupId}/history`);
      setMembershipHistory(res.data.histories);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchImportReports = async () => {
    try {
      const res = await api.get(`/groups/${groupId}/import-reports`);
      setReports(res.data.reports);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchGroupDetails();
  }, [groupId]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchMembershipHistory();
    } else if (activeTab === 'reports') {
      fetchImportReports();
    }
  }, [activeTab]);

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      await api.delete(`/expenses/${expenseId}`);
      fetchGroupDetails();
    } catch (err) {
      console.error(err);
      alert('Failed to delete expense.');
    }
  };

  // Member management
  const handleAddMember = async (e) => {
    e.preventDefault();
    setMemberError('');
    if (!newMemberEmail.trim()) return;

    setMemberSaving(true);
    try {
      const res = await api.post(`/groups/${groupId}/members`, { email: newMemberEmail });
      alert(res.data.message);
      setNewMemberEmail('');
      setMemberModalOpen(false);
      fetchGroupDetails();
    } catch (err) {
      console.error(err);
      setMemberError(err.response?.data?.error || 'Failed to add member.');
    } finally {
      setMemberSaving(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Are you sure you want to remove this member from the group?')) return;
    try {
      await api.delete(`/groups/${groupId}/members/${memberId}`);
      alert('Member removed from group successfully.');
      fetchGroupDetails();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to remove member.');
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-darkBg text-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-primary-500"></div>
          <p className="text-sm font-medium tracking-wide text-slate-400">Loading Group...</p>
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="min-h-screen bg-darkBg flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-xl mx-auto flex flex-col justify-center items-center px-6 text-center">
          <Info className="h-12 w-12 text-red-400 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400 text-sm mb-6">{error || 'Could not load group details.'}</p>
          <button onClick={() => navigate('/')} className="flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-5 py-2.5 text-sm font-semibold text-white transition-all">
            <ArrowLeft className="h-4 w-4" />
            <span>Dashboard</span>
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-darkBg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/groups')}
            className="rounded-xl border border-borderBg bg-cardBg/40 p-2.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white leading-tight">{group.name}</h1>
            <p className="text-slate-400 text-xs mt-1">{group.description || 'No description provided.'}</p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-borderBg pb-5 mb-8">
          <div className="flex bg-darkBg rounded-xl border border-borderBg p-1">
            {[
              { id: 'expenses', label: 'Expenses', count: expenses.length },
              { id: 'settlements', label: 'Payments', count: settlements.length },
              { id: 'balances', label: 'Balances & Debts', count: balances.length },
              { id: 'reports', label: 'CSV Reports', count: null },
              { id: 'history', label: 'History Log', count: null }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-4 py-2 text-xs font-semibold tracking-wide transition-all ${
                  activeTab === tab.id 
                    ? 'bg-primary-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label} {tab.count !== null && `(${tab.count})`}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate(`/group/${groupId}/csv-import`)}
              className="flex items-center gap-1.5 rounded-lg border border-borderBg bg-cardBg/20 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-all"
            >
              <Upload className="h-4 w-4 text-emerald-500" />
              <span>Import CSV</span>
            </button>

            <button
              onClick={() => setMemberModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-borderBg bg-cardBg/20 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-all"
            >
              <UserPlus className="h-4 w-4 text-primary-500" />
              <span>Add Member</span>
            </button>

            <button
              onClick={() => navigate(`/group/${groupId}/add-expense`)}
              className="flex items-center gap-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 px-4 py-2 text-xs font-semibold text-white shadow-md transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>Add Expense</span>
            </button>
          </div>
        </div>

        {/* Tab Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-4">
            {activeTab === 'expenses' && (
              <div className="rounded-2xl border border-borderBg bg-cardBg/20 p-6 backdrop-blur-md">
                <h2 className="text-md font-bold text-white mb-6">Group Expenses</h2>
                {expenses.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-borderBg rounded-xl">
                    <DollarSign className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">No expenses recorded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {expenses.map(exp => {
                      const userSplit = exp.splits?.find(s => s.user_id === user?.id);
                      const isPayer = exp.paid_by_id === user?.id;

                      return (
                        <div key={exp.id} className="flex items-center justify-between rounded-xl border border-borderBg bg-cardBg/40 p-4 hover:bg-cardBg/60 transition-all">
                          <div className="flex items-start gap-3.5">
                            <div className="rounded-lg bg-primary-500/10 text-primary-400 p-2.5 font-bold text-sm shrink-0">
                              {exp.original_currency === 'INR' ? '₹' : exp.original_currency}
                            </div>
                            <div>
                              <h4 className="font-semibold text-slate-200 text-sm">{exp.description}</h4>
                              <p className="text-[11px] text-slate-400 mt-1">
                                Paid by <span className="font-semibold text-slate-300">{exp.payer?.name}</span> • {new Date(exp.created_at).toLocaleDateString()}
                              </p>
                              {exp.original_currency !== 'INR' && (
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  {exp.original_currency} {parseFloat(exp.original_amount).toFixed(2)} at {parseFloat(exp.exchange_rate).toFixed(4)} rate
                                </p>
                              )}
                              <div className="mt-1.5 flex gap-1.5">
                                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                                  {exp.split_type} Split
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-6">
                            <div className="text-right font-sans">
                              <p className="text-xs font-bold text-white">INR {parseFloat(exp.converted_amount_inr).toFixed(2)}</p>
                              {isPayer ? (
                                <p className="text-[9px] font-semibold text-primary-500 mt-0.5">You lent</p>
                              ) : userSplit ? (
                                <p className="text-[9px] font-semibold text-red-400 mt-0.5">You owe INR {parseFloat(userSplit.amount).toFixed(2)}</p>
                              ) : (
                                <p className="text-[9px] font-semibold text-slate-500 mt-0.5">Not involved</p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => navigate(`/group/${groupId}/edit-expense/${exp.id}`)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-darkBg hover:text-white transition-all"
                                title="Edit Expense"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteExpense(exp.id)}
                                className="rounded-lg p-1.5 text-red-400/80 hover:bg-red-500/10 hover:text-red-400 transition-all"
                                title="Delete Expense"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'settlements' && (
              <div className="rounded-2xl border border-borderBg bg-cardBg/20 p-6 backdrop-blur-md">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-md font-bold text-white">Settlements (INR)</h2>
                  <button
                    onClick={() => navigate(`/group/${groupId}/settle`)}
                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all"
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    <span>Record Payment</span>
                  </button>
                </div>
                {settlements.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-borderBg rounded-xl">
                    <CheckCircle className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">No settlements recorded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {settlements.map(setl => (
                      <div key={setl.id} className="flex items-center justify-between rounded-xl border border-borderBg bg-cardBg/40 p-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-emerald-500/10 text-emerald-400 p-2 shrink-0">
                            <Check className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm text-slate-200">
                              <span className="font-semibold text-slate-100">{setl.payer?.name}</span> paid{' '}
                              <span className="font-semibold text-slate-100">{setl.payee?.name}</span>
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Recorded by {setl.recorder?.name || 'System'} • {new Date(setl.settled_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-emerald-400">INR {parseFloat(setl.amount_inr).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'balances' && (
              <div className="rounded-2xl border border-borderBg bg-cardBg/20 p-6 backdrop-blur-md">
                <h2 className="text-md font-bold text-white mb-6">Group Net Balances (INR)</h2>
                <div className="space-y-3">
                  {balances.map(b => (
                    <div key={b.userId} className="flex items-center justify-between rounded-xl border border-borderBg bg-cardBg/40 p-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs ${
                          b.balance > 0 ? 'bg-primary-500/10 text-primary-400' : b.balance < 0 ? 'bg-red-400/10 text-red-400' : 'bg-slate-700 text-slate-400'
                        }`}>
                          {b.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-200">{b.name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{b.email}</p>
                        </div>
                      </div>

                      <div className="text-right font-sans">
                        {b.balance > 0 ? (
                          <span className="text-sm font-bold text-primary-500">+INR {b.balance.toFixed(2)}</span>
                        ) : b.balance < 0 ? (
                          <span className="text-sm font-bold text-red-400">-INR {Math.abs(b.balance).toFixed(2)}</span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-500">Settled</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="rounded-2xl border border-borderBg bg-cardBg/20 p-6 backdrop-blur-md">
                <h2 className="text-md font-bold text-white mb-6">CSV Import logs</h2>
                {reports.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-borderBg rounded-xl">
                    <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">No import reports available.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reports.map(rep => (
                      <div
                        key={rep.id}
                        onClick={() => navigate(`/report/${rep.id}`)}
                        className="flex items-center justify-between rounded-xl border border-borderBg bg-cardBg/40 p-4 cursor-pointer hover:bg-cardBg transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-slate-500" />
                          <div>
                            <p className="text-sm font-bold text-slate-200">{rep.filename}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Uploaded by {rep.uploader_name} • {new Date(rep.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-xs">
                          <p className="font-semibold text-slate-400">{rep.processed_rows} / {rep.total_rows} Rows Processed</p>
                          {rep.anomalies_count > 0 && (
                            <p className="text-yellow-400 font-bold mt-0.5">{rep.anomalies_count} Anomalies Logged</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="rounded-2xl border border-borderBg bg-cardBg/20 p-6 backdrop-blur-md">
                <h2 className="text-md font-bold text-white mb-6">Membership Log history</h2>
                {membershipHistory.length === 0 ? (
                  <p className="text-sm text-slate-500">Loading history logs...</p>
                ) : (
                  <div className="space-y-4 relative pl-4 border-l border-borderBg">
                    {membershipHistory.map((hist) => (
                      <div key={hist.id} className="relative">
                        <div className="absolute -left-[22.5px] top-1.5 h-3 w-3 rounded-full bg-borderBg border-2 border-primary-500"></div>
                        <div className="text-sm text-slate-200">
                          <span className="font-semibold text-slate-100">{hist.name}</span> ({hist.email})
                          <div className="mt-1 text-[11px] text-slate-400 flex flex-col gap-0.5">
                            <span>Joined: {new Date(hist.joined_at).toLocaleString()}</span>
                            {hist.left_at && (
                              <span className="text-red-400 font-semibold">Left: {new Date(hist.left_at).toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-borderBg bg-cardBg/20 p-5 backdrop-blur-md">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
                Active Members ({activeMembers.length})
              </h3>
              
              <div className="space-y-3.5">
                {activeMembers.map(m => (
                  <div key={m.id} className="flex items-center justify-between group/member">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[10px] text-slate-400">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-300 leading-tight">{m.name}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">{m.email}</p>
                      </div>
                    </div>

                    {m.id !== user?.id && (
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        className="opacity-0 group-hover/member:opacity-100 rounded p-1 text-red-500 hover:bg-red-500/10 transition-all"
                        title="Remove member"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-borderBg bg-cardBg/20 p-5 backdrop-blur-md">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
                <span>Simplified Debts (INR)</span>
                <HelpCircle className="h-3.5 w-3.5 text-slate-500" />
              </h3>

              {simplifiedDebts.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 p-4 border border-borderBg text-slate-500 text-xs">
                  <CheckCircle className="h-4 w-4 text-primary-500" />
                  <span>Everything is settled!</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {simplifiedDebts.map((debt, idx) => (
                    <div key={idx} className="rounded-xl border border-borderBg bg-darkBg/60 p-3.5 flex flex-col gap-2">
                      <div className="text-xs text-slate-400 leading-normal">
                        <span className="font-semibold text-slate-200">{debt.fromName}</span> owes{' '}
                        <span className="font-semibold text-slate-200">{debt.toName}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-borderBg/50 pt-2">
                        <span className="font-bold text-sm text-red-400">INR {debt.amount.toFixed(2)}</span>
                        
                        <button
                          onClick={() => navigate(`/group/${groupId}/settle?payer=${debt.from}&payee=${debt.to}&amount=${debt.amount}`)}
                          className="rounded bg-primary-600/10 border border-primary-500/20 text-primary-400 px-2 py-1 text-[10px] font-semibold transition-all hover:bg-primary-600 hover:text-white"
                        >
                          Settle
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Add Member Modal (inline since simple) */}
      {memberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-darkBg/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-borderBg bg-cardBg p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-borderBg pb-4 mb-4">
              <h2 className="text-lg font-bold text-white">Add Member to Group</h2>
              <button onClick={() => setMemberModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-darkBg hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {memberError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{memberError}</span>
              </div>
            )}

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="friend@example.com"
                  className="w-full rounded-xl border border-borderBg bg-darkBg px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-primary-500"
                />
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-borderBg mt-6">
                <button
                  type="button"
                  onClick={() => setMemberModalOpen(false)}
                  className="rounded-xl border border-borderBg bg-darkBg px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={memberSaving}
                  className="rounded-xl bg-primary-600 hover:bg-primary-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {memberSaving ? 'Adding...' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupDetail;
