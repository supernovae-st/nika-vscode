import { describe, expect, it } from 'vitest';
import { journey, journeyPlaceholder, journeyStage } from '../core/journey';

const BASE = { binaryAvailable: true, workspaceOpen: true, equipped: true, hasWorkflows: true };

describe('the journey stage — one truth, four consumers', () => {
  it('no binary wins over everything (nothing else can light up)', () => {
    expect(journeyStage({ ...BASE, binaryAvailable: false })).toBe('noBinary');
    expect(journeyStage({ binaryAvailable: false, workspaceOpen: false, equipped: false, hasWorkflows: false })).toBe('noBinary');
  });

  it('workflows mean WORKING — even unequipped (equipping is never a blocker)', () => {
    expect(journeyStage(BASE)).toBe('working');
    expect(journeyStage({ ...BASE, equipped: false })).toBe('working');
  });

  it('a folder without the scaffold asks for Init', () => {
    expect(journeyStage({ ...BASE, equipped: false, hasWorkflows: false })).toBe('unequipped');
  });

  it('equipped-but-empty and no-folder both land on the proof stage', () => {
    expect(journeyStage({ ...BASE, hasWorkflows: false })).toBe('empty');
    expect(journeyStage({ ...BASE, workspaceOpen: false, equipped: false, hasWorkflows: false })).toBe('empty');
  });

  it('journey() carries facts and stage together', () => {
    const j = journey({ ...BASE, hasWorkflows: false, equipped: false });
    expect(j.stage).toBe('unequipped');
    expect(j.equipped).toBe(false);
  });

  it('placeholders speak the stage (and the active file when working)', () => {
    expect(journeyPlaceholder('noBinary')).toMatch(/Install the engine/);
    expect(journeyPlaceholder('unequipped')).toMatch(/Init/);
    expect(journeyPlaceholder('empty')).toMatch(/offline/);
    expect(journeyPlaceholder('working', 'a.nika.yaml')).toContain('a.nika.yaml');
    expect(journeyPlaceholder('working')).toMatch(/What next/);
  });
});
