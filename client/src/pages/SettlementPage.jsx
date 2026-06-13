import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/layout/Navbar';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';

const SettlementPage = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Load states
  const [activeMembers, setActiveMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Form states
  const [payerId, setPayerId] = useState('');
  const [payeeId, setPayeeId] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await api.get(`/groups/${groupId}`);
        setActiveMembers(res.data.activeMembers);

        // Pre-fill fields from search params if present
        const prePayer = searchParams.get('payer');
        const prePayee = searchParams.get('payee');
        const preAmount = searchParams.get('amount');

        if (prePayer) setPayerId(prePayer);
        if (prePayee) setPayeeId(prePayee);
        if (preAmount) setAmount(preAmount);

      } catch (err) {
        console.error(err);
        setError('Failed to fetch group members.');
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, [groupId, searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!payerId || !payeeId || !amount) {
      return setError('Payer, payee, and amount are required.');
    }

    if (parseInt(payerId) === parseInt(payeeId)) {
      return setError('Payer and payee must be different.');
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return setError('Please enter a valid positive amount.');
    }

    setSaving(true);
    try {
      await api.post(`/groups/${groupId}/settlements`, {
        payerId: parseInt(payerId),
        payeeId: parseInt(payeeId),
        amount: numericAmount
      });
      navigate(`/group/${groupId}`);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

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

      <main className="flex-1 max-w-lg w-full mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(`/group/${groupId}`)}
            className="rounded-xl border border-borderBg bg-cardBg/45 p-2 text-slate-400 hover:text-white transition-all"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-white">Record Payment</h1>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-2.5 rounded-lg bg-red-500/10 border border-red-500/20 p-3.5 text-sm text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="rounded-2xl border border-borderBg bg-cardBg/30 p-6 backdrop-blur-md space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Who Paid? (Payer)</label>
            <select
              required
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className="w-full rounded-xl border border-borderBg bg-darkBg px-4 py-3 text-sm text-slate-200 outline-none focus:border-primary-500"
            >
              <option value="">Select payer</option>
              {activeMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Who Received? (Payee)</label>
            <select
              required
              value={payeeId}
              onChange={(e) => setPayeeId(e.target.value)}
              className="w-full rounded-xl border border-borderBg bg-darkBg px-4 py-3 text-sm text-slate-200 outline-none focus:border-primary-500"
            >
              <option value="">Select payee</option>
              {activeMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Amount in INR (₹)</label>
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
              className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Recording...' : 'Record Payment'}</span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default SettlementPage;
