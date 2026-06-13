import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/layout/Navbar';
import { ArrowLeft, Upload, FileDown, AlertCircle, Info, ChevronRight } from 'lucide-react';

const CsvImportPage = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [details, setDetails] = useState([]);
  const [saving, setSaving] = useState(false);

  const handleCsvSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setDetails([]);
    if (!file) return setError('Please select a CSV file.');

    const formData = new FormData();
    formData.append('file', file);

    setSaving(true);
    try {
      const res = await api.post(`/groups/${groupId}/expenses/import-csv`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      alert(res.data.message || 'CSV imported successfully!');
      navigate(`/report/${res.data.reportId}`);
    } catch (err) {
      console.error(err);
      const errRes = err.response?.data;
      setError(errRes?.error || 'Failed to import CSV.');
      if (errRes?.details) {
        setDetails(errRes.details);
      }
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = 
      "Date,Description,TotalAmount,PaidByEmail,SplitType,ShareDetails,Currency,ExchangeRate\n" +
      "2026-06-10,Group Dinner,120.00,user1@example.com,EQUAL,,INR,1.0\n" +
      "2026-06-11,Movie Tickets,30.00,user2@example.com,EXACT,\"user1@example.com:10,user2@example.com:20\",INR,1.0\n" +
      "2026-06-12,Hotel Stay,200.00,user1@example.com,PERCENTAGE,\"user1@example.com:50,user2@example.com:50\",USD,83.5";
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "splitbuddy_multi_currency_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-darkBg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/group/${groupId}`)}
              className="rounded-xl border border-borderBg bg-cardBg/45 p-2 text-slate-400 hover:text-white transition-all"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Import CSV Module</h1>
              <p className="text-slate-400 text-xs mt-1">Bulk upload and audit expense logs</p>
            </div>
          </div>

          <button
            onClick={() => navigate(`/group/${groupId}`)}
            className="flex items-center gap-1.5 rounded-lg border border-borderBg bg-cardBg/20 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-all"
          >
            <span>View Import Logs</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-6 flex flex-col gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3.5 text-xs text-red-400">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="font-semibold">{error}</span>
            </div>
            {details.length > 0 && (
              <div className="max-h-40 overflow-y-auto pl-6 mt-2 border-t border-red-500/10 pt-2 space-y-1 font-mono text-[10px]">
                {details.map((det, idx) => <div key={idx}>• {det}</div>)}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleCsvSubmit} className="rounded-2xl border border-borderBg bg-cardBg/30 p-6 backdrop-blur-md space-y-6">
          <div className="border-2 border-dashed border-borderBg hover:border-primary-500/60 rounded-xl p-8 text-center cursor-pointer transition-all bg-darkBg/30">
            <input
              type="file"
              accept=".csv"
              required
              id="csv-file-upload"
              onChange={(e) => setFile(e.target.files[0])}
              className="hidden"
            />
            <label htmlFor="csv-file-upload" className="cursor-pointer flex flex-col items-center gap-3">
              <Upload className="h-10 w-10 text-slate-500 hover:text-primary-500 transition-colors" />
              <span className="text-sm font-semibold text-slate-300">
                {file ? file.name : 'Click to select or drag and drop CSV file'}
              </span>
              <span className="text-xs text-slate-500">Only .csv files up to 5MB supported</span>
            </label>
          </div>

          <div className="rounded-xl bg-slate-900/60 border border-borderBg p-5 text-xs text-slate-400 leading-relaxed space-y-2.5">
            <h4 className="font-bold text-slate-300 text-sm flex items-center gap-1.5">
              <Info className="h-4 w-4 text-primary-500" />
              <span>CSV Columns Specification</span>
            </h4>
            <p>Make sure your file contains the exact columns below in order:</p>
            <code className="block bg-darkBg p-2.5 rounded text-slate-200 font-mono text-[10px] overflow-x-auto">
              Date,Description,TotalAmount,PaidByEmail,SplitType,ShareDetails,Currency,ExchangeRate
            </code>
            <p><strong>Anomaly Audit System:</strong> Duplicate rows, negative amounts, invalid dates, left-group splits, and unknown participants will be logged in details. Settlements recorded as expenses will automatically resolve as payment records.</p>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-borderBg">
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 rounded-xl border border-borderBg bg-darkBg px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white transition-all"
            >
              <FileDown className="h-4 w-4 text-primary-500" />
              <span>Download Template</span>
            </button>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-primary-600 hover:bg-primary-500 px-6 py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-50"
            >
              {saving ? 'Importing...' : 'Upload & Audit'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default CsvImportPage;
