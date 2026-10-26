// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { EmergencyBanner } from './components/EmergencyBanner';
import { SimulatedBadge } from './components/SimulatedBadge';

describe('UI Primitives and Medical Safety Banners', () => {
  it('renders EmergencyBanner with FAST warning and direct 911 call link', () => {
    render(<EmergencyBanner visible={true} message="Acute asymmetry observed" />);
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/Acute asymmetry observed/i)).toBeDefined();
    expect(screen.getByText(/Call 911 \/ EMS Now/i)).toBeDefined();
  });

  it('does not render EmergencyBanner when visible is false', () => {
    const { container } = render(<EmergencyBanner visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders SimulatedBadge with clear labeling for simulated data', () => {
    render(<SimulatedBadge />);
    expect(screen.getByText(/SIMULATED DATA/i)).toBeDefined();
  });
});
