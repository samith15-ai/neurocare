// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReportView } from './ReportView';
import type { Report, Patient, Finding } from '../../types';

describe('ReportView Component', () => {
  afterEach(() => {
    cleanup();
  });
  const mockPatient: Patient = {
    id: 'pat-123',
    mrn: 'NC-2026-0841',
    first_name: 'Arthur',
    last_name: 'Pendelton',
    date_of_birth: '1962-04-12',
    gender: 'Male',
    created_at: new Date().toISOString()
  };

  const mockFindings: Finding[] = [
    {
      id: 'f-1',
      assessment_id: 'ass-123',
      domain: 'motor',
      finding_title: 'Slowness with reduced movement amplitude',
      explanation: 'Observed simultaneous reduction in finger-tapping cadence and peak opening amplitude.',
      evidence_metrics: JSON.stringify({
        rule_id: 'RULE_SLOWNESS_REDUCED_AMPLITUDE',
        actual_values: { right_finger_tap_frequency_hz: 2.2, right_finger_tap_mean_amplitude: 0.6 },
        reference_values: { right_finger_tap_frequency_hz: 3.4, right_finger_tap_mean_amplitude: 1.1 },
        quality: 'valid'
      }),
      clinical_relevance: 'Observed behavioral deviation - Review advised',
      requires_review: true,
      status: 'unreviewed'
    }
  ];

  const mockReport: Report = {
    id: 'rep-123',
    assessment_id: 'ass-123',
    patient_id: 'pat-123',
    summary_text: 'Contactless multimodal evaluation completed. Status: Review advised.',
    overall_status: 'Review advised',
    late_fusion_score: 2.35,
    domain_scores_json: JSON.stringify({
      motor: 2.35,
      speech: 0.45,
      facial: 0.20,
      gait: null,
      balance: null,
      cognition: null
    }),
    emergency_fast_triggered: false,
    is_simulated: true,
    approved_by_doctor: false,
    created_at: new Date().toISOString(),
    findings: mockFindings
  };

  it('renders overall status, domain scores, and simulated banner', () => {
    render(<ReportView report={mockReport} patient={mockPatient} canApprove={true} />);

    // Check status badges
    expect(screen.getAllByText(/Review advised/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2.35/i).length).toBeGreaterThan(0);

    // Check domain headers
    expect(screen.getByText(/Motor \(Tapping\)/i)).toBeDefined();
    expect(screen.getByText(/Speech & Voice/i)).toBeDefined();
    expect(screen.getByText(/Facial Motion/i)).toBeDefined();
    expect(screen.getByText(/Gait \(Ambulation\)/i)).toBeDefined();
    expect(screen.getByText(/Balance \(Stance\)/i)).toBeDefined();
    expect(screen.getByText(/Cognition/i)).toBeDefined();

    // Check simulated badge
    expect(screen.getAllByText(/SIMULATED/i).length).toBeGreaterThan(0);
  });

  it('renders findings table and opens evidence modal on click', () => {
    render(<ReportView report={mockReport} patient={mockPatient} canApprove={true} />);

    // Check finding title
    expect(screen.getAllByText(/Slowness with reduced movement amplitude/i).length).toBeGreaterThan(0);

    // Click "Inspect Evidence"
    const inspectBtn = screen.getByText(/Inspect Evidence/i);
    fireEvent.click(inspectBtn);

    // Modal should now be open
    expect(screen.getByText(/Interactive Evidence Trace/i)).toBeDefined();
    expect(screen.getByText(/RULE_SLOWNESS_REDUCED_AMPLITUDE/i)).toBeDefined();
    expect(screen.getByText(/right_finger_tap_frequency_hz/i)).toBeDefined();

    // Close modal
    const closeBtn = screen.getByText(/Close Evidence Trace/i);
    fireEvent.click(closeBtn);
    expect(screen.queryByText(/Interactive Evidence Trace/i)).toBeNull();
  });

  it('renders physician review controls when canApprove is true', () => {
    render(<ReportView report={mockReport} patient={mockPatient} canApprove={true} />);

    expect(screen.getAllByText(/Clinician Verification & Clinical Notes/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Agree with Findings/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Unsure \/ Re-test Advised/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Disagree \/ Artifact/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Save Physician Review/i)).toBeDefined();
  });
});
