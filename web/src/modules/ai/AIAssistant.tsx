import React, { useState } from 'react';
import { Bot, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';

interface AIAssistantProps {
  patientId: string;
  assessmentId?: string;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ patientId, assessmentId }) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{
    summary: string;
    evidence_points: Array<{
      metric_name: string;
      observed_value: number;
      unit: string;
      baseline_value?: number;
      change_direction: string;
      relevance_note: string;
    }>;
    clinical_caution: string;
    confidence: number;
  } | null>(null);

  const predefinedPrompts = [
    'How do the current motor kinematics compare to baseline?',
    'Are there any notable changes in facial mobility?',
    'Summarize vocal acoustic features from the last assessment.',
  ];

  const handleAsk = async (queryText?: string) => {
    const q = queryText || question;
    if (!q.trim()) return;

    setLoading(true);
    try {
      const res = await api.askAIAssistant(patientId, q, assessmentId);
      setResponse(res);
      setQuestion('');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-950 text-indigo-400 p-2 rounded-xl border border-indigo-800/60">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Explainable Clinical AI Assistant
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </h3>
            <p className="text-xs text-slate-400">Evidence-linked interpretations referencing stored kinematic measurements</p>
          </div>
        </div>
      </div>

      {/* Quick Prompts */}
      <div className="flex flex-wrap gap-2">
        {predefinedPrompts.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleAsk(p)}
            className="text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 transition text-left"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Response Box */}
      {response && (
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-xs text-slate-200 leading-relaxed font-medium">{response.summary}</p>

          {/* Evidence Citations */}
          {response.evidence_points.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800/80">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Direct Metric Citations:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {response.evidence_points.map((pt, i) => (
                  <div key={i} className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs">
                    <div className="flex items-center justify-between font-semibold text-slate-300">
                      <span>{pt.metric_name.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-sky-400">
                        {pt.observed_value} {pt.unit}
                      </span>
                    </div>
                    {pt.baseline_value !== undefined && (
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Baseline: {pt.baseline_value} {pt.unit} ({pt.change_direction})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mandatory Clinical Caution */}
          <div className="bg-amber-950/20 border border-amber-900/40 p-2.5 rounded-lg flex items-start gap-2 text-[11px] text-amber-300">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
            <span>{response.clinical_caution}</span>
          </div>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAsk();
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about kinematic observations, baseline trends, or evidence..."
          className="flex-1 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-4 py-2.5 outline-none focus:border-sky-500 transition"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white p-2.5 rounded-xl transition"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
