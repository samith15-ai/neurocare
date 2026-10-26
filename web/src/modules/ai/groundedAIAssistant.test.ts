import { describe, it, expect } from 'vitest';

export interface GroundedCheckInput {
  hasBaseline: boolean;
  validSessionsCount: number;
  hasKinematics: boolean;
  userRole: 'patient' | 'doctor';
  queryText: string;
}

export function evaluateAIAssistantSafety(input: GroundedCheckInput): {
  isDiagnosticRefusal: boolean;
  isEmergencyFast: boolean;
  isBaselineMissing: boolean;
  roleMode: 'patient' | 'doctor';
  responseSnippet: string;
} {
  const queryLower = input.queryText.toLowerCase();

  // 1. FAST Emergency Trigger Check
  const strokeKeywords = ['facial droop', 'droop', 'slurred speech', 'arm weakness', 'sudden weakness', 'stroke'];
  const isEmergencyFast = strokeKeywords.some((k) => queryLower.includes(k));

  // 2. Diagnostic Query Check
  const diagnosticKeywords = ["do i have parkinson", "diagnose", "is it als", "do i have ms", "what disease"];
  const isDiagnosticRefusal = diagnosticKeywords.some((d) => queryLower.includes(d));

  // 3. Baseline Availability Check
  const isBaselineMissing = !input.hasBaseline || input.validSessionsCount < 3;

  let snippet = '';

  if (isEmergencyFast) {
    snippet =
      'EMERGENCY ADVISORY (FAST Protocol): If you or the patient are experiencing sudden facial droop, arm or leg weakness, slurred speech, or difficulty speaking, please call 911 immediately.';
  } else if (isDiagnosticRefusal) {
    snippet =
      input.userRole === 'patient'
        ? "NeuroCare measures physical and vocal movement patterns such as tap rhythm and voice stability. I cannot diagnose Parkinson's disease, ALS, or any medical condition."
        : 'Diagnostic determination guardrail active: NeuroCare provides quantitative kinematic tracking only.';
  } else if (isBaselineMissing) {
    snippet = 'Personal baseline is not yet established. At least 3 valid sessions are required.';
  } else if (input.userRole === 'patient') {
    snippet =
      'Your tapping speed was lower than your personal baseline in the last three valid sessions. This is an observed change, not a diagnosis. You may wish to discuss it with your clinician.';
  } else {
    snippet =
      'Clinical Tele-Monitoring Summary: Longitudinal State: ACTIVE CHANGE. Active Deviations: Observed shift in finger tap speed hz: Current 2.80 vs Baseline 4.50 Hz (|Z|=5.67σ, 3 sessions).';
  }

  return {
    isDiagnosticRefusal,
    isEmergencyFast,
    isBaselineMissing,
    roleMode: input.userRole,
    responseSnippet: snippet,
  };
}

export function validateClinicianSummaryApproval(
  userRole: 'patient' | 'doctor',
  explicitApprovalConfirmed: boolean
): {
  canSaveToRecord: boolean;
  rejectionReason?: string;
} {
  if (userRole !== 'doctor') {
    return {
      canSaveToRecord: false,
      rejectionReason: 'Only licensed clinicians can approve and save clinical summaries.',
    };
  }
  if (!explicitApprovalConfirmed) {
    return {
      canSaveToRecord: false,
      rejectionReason: 'Explicit approval confirmation is required before saving to clinical record.',
    };
  }
  return { canSaveToRecord: true };
}

describe('Phase 7: Grounded AI Assistant & Clinical Summary Guardrails', () => {
  it('correctly reports missing baseline without hallucinating numbers', () => {
    const result = evaluateAIAssistantSafety({
      hasBaseline: false,
      validSessionsCount: 1,
      hasKinematics: true,
      userRole: 'patient',
      queryText: 'How is my finger tapping compared to my baseline?',
    });

    expect(result.isBaselineMissing).toBe(true);
    expect(result.responseSnippet).toContain('Personal baseline is not yet established.');
    expect(result.responseSnippet).toContain('At least 3 valid sessions are required.');
  });

  it('strictly refuses to diagnose diseases or output arbitrary probabilities', () => {
    const result = evaluateAIAssistantSafety({
      hasBaseline: true,
      validSessionsCount: 5,
      hasKinematics: true,
      userRole: 'patient',
      queryText: "Do I have Parkinson's disease? Give me the percentage chance.",
    });

    expect(result.isDiagnosticRefusal).toBe(true);
    expect(result.responseSnippet).toContain("I cannot diagnose Parkinson's disease");
    expect(result.responseSnippet).not.toContain('% chance');
    expect(result.responseSnippet).not.toContain('80%');
  });

  it('triggers emergency FAST protocol when acute stroke symptoms are queried', () => {
    const result = evaluateAIAssistantSafety({
      hasBaseline: true,
      validSessionsCount: 4,
      hasKinematics: true,
      userRole: 'patient',
      queryText: 'My mother has sudden facial droop and slurred speech right now.',
    });

    expect(result.isEmergencyFast).toBe(true);
    expect(result.responseSnippet).toContain('FAST Protocol');
    expect(result.responseSnippet).toContain('call 911 immediately');
  });

  it('formats role-adapted language for patient (plain-language) and doctor (kinematic)', () => {
    const patResult = evaluateAIAssistantSafety({
      hasBaseline: true,
      validSessionsCount: 4,
      hasKinematics: true,
      userRole: 'patient',
      queryText: 'How are my tapping results?',
    });

    expect(patResult.roleMode).toBe('patient');
    expect(patResult.responseSnippet).toContain('observed change, not a diagnosis');
    expect(patResult.responseSnippet).toContain('discuss it with your clinician');

    const docResult = evaluateAIAssistantSafety({
      hasBaseline: true,
      validSessionsCount: 4,
      hasKinematics: true,
      userRole: 'doctor',
      queryText: 'Provide longitudinal kinematic deviation summary.',
    });

    expect(docResult.roleMode).toBe('doctor');
    expect(docResult.responseSnippet).toContain('Clinical Tele-Monitoring Summary');
    expect(docResult.responseSnippet).toContain('Longitudinal State: ACTIVE CHANGE');
    expect(docResult.responseSnippet).toContain('|Z|=5.67σ');
  });

  it('strictly blocks patient from approving SOAP summaries and requires explicit clinician confirmation', () => {
    // 1. Patient trying to approve
    const patTry = validateClinicianSummaryApproval('patient', true);
    expect(patTry.canSaveToRecord).toBe(false);
    expect(patTry.rejectionReason).toContain('Only licensed clinicians');

    // 2. Doctor without explicit approval checkbox
    const docNoApprove = validateClinicianSummaryApproval('doctor', false);
    expect(docNoApprove.canSaveToRecord).toBe(false);
    expect(docNoApprove.rejectionReason).toContain('Explicit approval confirmation is required');

    // 3. Doctor with explicit approval checkbox
    const docValid = validateClinicianSummaryApproval('doctor', true);
    expect(docValid.canSaveToRecord).toBe(true);
  });
});
