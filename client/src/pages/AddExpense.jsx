import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import Navbar from '../components/layout/Navbar';
import { ArrowLeft, Save, AlertCircle, CheckSquare, Square } from 'lucide-react';

const AddExpense = () => {
  const { groupId, expenseId } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  // Load states
  const [activeMembers, setActiveMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [exchangeRate, setExchangeRate] = useState('1.0');
  const [paidById, setPaidById] = useState('');
  const [splitType, setSplitType] = useState('EQUAL');
  const [splits, setSplits] = useState({}); // userId -> { checked: bool, amount: string, percentage: string }
  const [saving, setSaving] = useState(false);

  // Fetch initial group details to populate members list
  useEffect(() => {
    const fetchInitData = async () => {
      try {
        const groupRes = await api.get(`/groups/${groupId}`);
        setActiveMembers(groupRes.data.activeMembers);

        if (expenseId) {
          // Edit mode: fetch existing expense details
          const exp = groupRes.data.expenses.find(e => e.id === parseInt(expenseId));
          if (exp) {
            setDescription(exp.description);
            setAmount(exp.original_amount);
            setCurrency(exp.original_currency);
            setExchangeRate(exp.exchange_rate.toString());
            setPaidById(exp.paid_by_id);
            setSplitType(exp.split_type);

            const splitConfig = {};
            // Init active members as unchecked
            groupRes.data.activeMembers.forEach(m => {
              splitConfig[m.id] = { checked: false, amount: '', percentage: '' };
            });
            // Populate checks from shares
            exp.splits.forEach(s => {
              const origShareAmount = Math.round((parseFloat(s.amount) / exp.exchange_rate) * 100) / 100;
              splitConfig[s.user_id] = {
                checked: true,
                amount: origShareAmount.toString(),
                percentage: s.percentage ? s.percentage.toString() : ''
              };
            });
            setSplits(splitConfig);
          } else {
            setError('Expense details not found.');
          }
        } else {
          // Add mode: default select uploader as payer and check all active members
          setPaidById(user?.id || '');
          const splitConfig = {};
          groupRes.data.activeMembers.forEach(m => {
            splitConfig[m.id] = { checked: true, amount: '', percentage: '' };
          });
          setSplits(splitConfig);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to fetch group details.');
      } finally {
        setLoading(false);
      }
    };

    fetchInitData();
  }, [groupId, expenseId, user]);

  const handleSplitToggle = (userId) => {
    setSplits(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        checked: !prev[userId].checked
      }
    }));
  };

  const handleSplitChange = (userId, field, val) => {
    setSplits(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: val
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!description.trim()) return setError('Description is required.');
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) return setError('Please enter a valid positive amount.');
    if (!paidById) return setError('Please select who paid.');

    const rate = parseFloat(exchangeRate);
    if (isNaN(rate) || rate <= 0) return setError('Please enter a valid exchange rate.');

    const activeSplits = Object.keys(splits)
      .filter(uid => splits[uid].checked)
      .map(uid => ({
        userId: parseInt(uid),
        amount: parseFloat(splits[uid].amount) || 0,
        percentage: parseFloat(splits[uid].percentage) || 0
      }));

    if (activeSplits.length === 0) return setError('At least one member must be selected to split.');

    // Validate calculations
    if (splitType === 'EXACT') {
      const splitSum = activeSplits.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(splitSum - numericAmount) > 0.01) {
        return setError(`Total of exact splits (${currency} ${splitSum.toFixed(2)}) must equal total amount (${currency} ${numericAmount.toFixed(2)}).`);
      }
    } else if (splitType === 'PERCENTAGE') {
      const splitPct = activeSplits.reduce((sum, s) => sum + s.percentage, 0);
      if (Math.abs(splitPct - 100) > 0.01) {
        return setError(`Percentages must sum to 100%. Current: ${splitPct}%`);
      }
    }

    setSaving(true);
    try {
      const payload = {
        description: description.trim(),
        amount: numericAmount,
        paidById: parseInt(paidById),
        splitType,
        splits: activeSplits,
        originalCurrency: currency,
        exchangeRate: rate
      };

      if (expenseId) {
        await api.put(`/expenses/${expenseId}`, payload);
      } else {
        await api.post(`/groups/${groupId}/expenses`, payload);
      }

      navigate(`/group/${groupId}`);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  };

  const convertedInrAmount = (parseFloat(amount) || 0) * (parseFloat(exchangeRate) || 1.0);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-darkBg text-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-darkBg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(`/group/${groupId}`)}
            className="rounded-xl border border-borderBg bg-cardBg/45 p-2 text-slate-400 hover:text-white transition-all"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-white">
            {expenseId ? 'Edit Expense' : 'Add Expense'}
          </h1>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-2.5 rounded-lg bg-red-500/10 border border-red-500/20 p-3.5 text-sm text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="rounded-2xl border border-borderBg bg-cardBg/30 p-6 backdrop-blur-md space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Description</label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Flight, Dinner, Cab"
                className="w-full rounded-xl border border-borderBg bg-darkBg px-4 py-3 text-sm text-slate-200 outline-none focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Paid By</label>
              <select
                required
                value={paidById}
                onChange={(e) => setPaidById(e.target.value)}
                className="w-full rounded-xl border border-borderBg bg-darkBg px-4 py-3 text-sm text-slate-200 outline-none focus:border-primary-500"
              >
                <option value="">Select payer</option>
                {activeMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Amount</label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-borderBg bg-darkBg px-4 py-3 text-sm text-slate-200 outline-none focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Currency</label>
              <select
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  if (e.target.value === 'INR') setExchangeRate('1.0');
                }}
                className="w-full rounded-xl border border-borderBg bg-darkBg px-4 py-3 text-sm text-slate-200 outline-none focus:border-primary-500"
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Exchange Rate (to INR)</label>
              <input
                type="number"
                step="0.0001"
                required
                disabled={currency === 'INR'}
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                placeholder="1.0"
                className="w-full rounded-xl border border-borderBg bg-darkBg px-4 py-3 text-sm text-slate-200 outline-none focus:border-primary-500 disabled:opacity-40"
              />
            </div>
          </div>

          {currency !== 'INR' && (
            <div className="rounded-xl bg-primary-500/10 border border-primary-500/20 p-3 text-xs text-primary-400">
              Equivalent Converted Value: <strong>INR {convertedInrAmount.toFixed(2)}</strong> (at {exchangeRate} exchange rate).
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Split Strategy</label>
            <select
              value={splitType}
              onChange={(e) => setSplitType(e.target.value)}
              className="w-full rounded-xl border border-borderBg bg-darkBg px-4 py-3 text-sm text-slate-200 outline-none focus:border-primary-500"
            >
              <option value="EQUAL">Split Equally</option>
              <option value="EXACT">Split Exact Amounts ({currency})</option>
              <option value="PERCENTAGE">Split Percentages (%)</option>
            </select>
          </div>

          {/* Members list checkbox selector */}
          <div className="rounded-xl border border-borderBg bg-darkBg/50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Participants shares</h3>
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2">
              {activeMembers.map(m => {
                const config = splits[m.id] || { checked: false, amount: '', percentage: '' };
                return (
                  <div key={m.id} className="flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => handleSplitToggle(m.id)}
                      className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
                    >
                      {config.checked ? (
                        <CheckSquare className="h-5 w-5 text-primary-500" />
                      ) : (
                        <Square className="h-5 w-5 text-slate-600" />
                      )}
                      <span>{m.name}</span>
                    </button>

                    {config.checked && (
                      <div className="flex items-center gap-2">
                        {splitType === 'EXACT' && (
                          <div className="relative">
                            <span className="absolute left-2.5 top-2.5 text-slate-500 text-xs">{currency === 'INR' ? '₹' : '$'}</span>
                            <input
                              type="number"
                              step="0.01"
                              required
                              value={config.amount}
                              onChange={(e) => handleSplitChange(m.id, 'amount', e.target.value)}
                              placeholder="0.00"
                              className="w-24 rounded-lg border border-borderBg bg-darkBg pl-6 pr-2 py-1.5 text-xs text-slate-200 outline-none focus:border-primary-500"
                            />
                          </div>
                        )}

                        {splitType === 'PERCENTAGE' && (
                          <div className="relative">
                            <input
                              type="number"
                              step="1"
                              required
                              value={config.percentage}
                              onChange={(e) => handleSplitChange(m.id, 'percentage', e.target.value)}
                              placeholder="0"
                              className="w-20 rounded-lg border border-borderBg bg-darkBg px-2 py-1.5 text-xs text-slate-200 text-right outline-none focus:border-primary-500"
                            />
                            <span className="ml-1.5 text-xs text-slate-500 font-semibold">%</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-borderBg">
            <button
              type="button"
              onClick={() => navigate(`/group/${groupId}`)}
              className="rounded-xl border border-borderBg bg-darkBg px-5 py-3 text-sm font-semibold text-slate-300 hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-500 px-6 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving...' : 'Save Expense'}</span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default AddExpense;
