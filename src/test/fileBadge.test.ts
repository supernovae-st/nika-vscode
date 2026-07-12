import { describe, expect, it } from 'vitest';
import { isNikaWorkflowPath } from '../core/nikaPath';

describe('the Explorer badge matcher', () => {
  it('matches workflow files, both spellings, any case', () => {
    expect(isNikaWorkflowPath('/w/flows/daily.nika.yaml')).toBe(true);
    expect(isNikaWorkflowPath('/w/flows/daily.nika.yml')).toBe(true);
    expect(isNikaWorkflowPath('/W/DAILY.NIKA.YAML')).toBe(true);
  });
  it('stays silent on everything else', () => {
    expect(isNikaWorkflowPath('/w/settings.yaml')).toBe(false);
    expect(isNikaWorkflowPath('/w/nika.yaml.bak')).toBe(false);
    expect(isNikaWorkflowPath('/w/x.nikayaml')).toBe(false);
    expect(isNikaWorkflowPath('/w/README.md')).toBe(false);
  });
});
