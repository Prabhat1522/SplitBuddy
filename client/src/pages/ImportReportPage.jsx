import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/layout/Navbar';
import { ArrowLeft, CheckCircle, Info, Calendar, FileText, AlertTriangle } from 'lucide-react';

const ImportReportPage = () => {
  const { reportId } = useParams();
  const navigate = useNavigate();

  const [report, setReport] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setError('');
        const res = await api.get(`/import-reports/${reportId}`);
        setReport(res.data.report);
        setAnomalies(res.data.anomalies);
      } catch (err) {
        console.error(err);
        setError('Failed to load import report logs.');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [reportId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-darkBg text-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-primary-500"></div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-darkBg flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-xl mx-auto flex flex-col justify-center items-center px-6 text-center">
          <Info className="h-12 w-12 text-red-400 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Error</h2>
          <p className="text-slate-400 text-sm mb-6">{error || 'Report could not be loaded.'}</p>
          <button onClick={() => navigate('/')} className="flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-5 py-2.5 text-sm font-semibold text-white transition-all">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-darkBg flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(`/group/${report.group_id}`)}
            className="rounded-xl border border-borderBg bg-cardBg/45 p-2 text-slate-400 hover:text-white transition-all"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white leading-tight">Import Report Summary</h1>
            <p className="text-slate-400 text-xs mt-1">Audit log details for {report.filename}</p>
          </div>
        </div>

        {/* Audit Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="rounded-2xl border border-borderBg bg-cardBg/40 p-5 backdrop-blur-md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Rows Found</p>
            <h3 className="text-xl font-bold mt-1 text-slate-200">{report.total_rows}</h3>
          </div>

          <div className="rounded-2xl border border-borderBg bg-cardBg/40 p-5 backdrop-blur-md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Processed Rows</p>
            <h3 className="text-xl font-bold mt-1 text-primary-500">{report.processed_rows}</h3>
          </div>

          <div className="rounded-2xl border border-borderBg bg-cardBg/40 p-5 backdrop-blur-md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Anomalies Detected</p>
            <h3 className={`text-xl font-bold mt-1 ${report.anomalies_count > 0 ? 'text-yellow-400' : 'text-slate-400'}`}>
              {report.anomalies_count}
            </h3>
          </div>

          <div className="rounded-2xl border border-borderBg bg-cardBg/40 p-5 backdrop-blur-md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Upload Date</p>
            <h3 className="text-sm font-semibold mt-2.5 text-slate-300 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-slate-500" />
              <span>{new Date(report.created_at).toLocaleDateString()}</span>
            </h3>
          </div>
        </div>

        {/* Anomalies Table Logs */}
        <div className="rounded-2xl border border-borderBg bg-cardBg/20 p-6 backdrop-blur-md">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <span>Anomaly Audit Trail</span>
          </h2>

          {anomalies.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-primary-500/10 border border-primary-500/20 p-5 text-sm text-primary-400">
              <CheckCircle className="h-5 w-5" />
              <span>Zero anomalies found! All rows imported smoothly.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm text-slate-300">
                <thead>
                  <tr className="border-b border-borderBg text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="pb-3 pl-2">Row</th>
                    <th className="pb-3">Anomaly Type</th>
                    <th className="pb-3">Detected Value</th>
                    <th className="pb-3">Resolved Value</th>
                    <th className="pb-3">Action Taken</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderBg/40">
                  {anomalies.map((anom) => (
                    <tr key={anom.id} className="hover:bg-cardBg/30 transition-colors">
                      <td className="py-3.5 pl-2 font-bold text-slate-400">{anom.row_index}</td>
                      <td className="py-3.5">
                        <span className="rounded bg-yellow-500/10 px-2 py-0.5 text-[9px] font-bold text-yellow-400 uppercase tracking-wider">
                          {anom.anomaly_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 max-w-[200px] truncate text-slate-400 font-mono text-[11px]">{anom.detected_value}</td>
                      <td className="py-3.5 max-w-[200px] truncate text-slate-300 font-semibold">{anom.resolved_value || 'N/A'}</td>
                      <td className="py-3.5 text-xs">
                        <span className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                          anom.action_taken === 'SKIPPED_ROW' 
                            ? 'bg-red-500/10 text-red-400 border border-red-500/15' 
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                        }`}>
                          {anom.action_taken}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ImportReportPage;
