import { describe, expect, it } from 'vitest';
import { isNikaWorkflowPath } from '../core/nikaPath';

describe('the Explorer badge matcher', () => {
  it('matches canonical lowercase .nika program files', () => {
    expect(isNikaWorkflowPath('/w/flows/daily.nika')).toBe(true);
    expect(isNikaWorkflowPath('/w/flows/support.v2.nika')).toBe(true);
  });
  it('stays silent on retired aliases, case variants, and everything else', () => {
    expect(isNikaWorkflowPath('/w/flows/daily.nika.yaml')).toBe(false);
    expect(isNikaWorkflowPath('/w/flows/daily.nika.yml')).toBe(false);
    expect(isNikaWorkflowPath('/W/DAILY.NIKA.YAML')).toBe(false);
    expect(isNikaWorkflowPath('/W/DAILY.NIKA')).toBe(false);
    expect(isNikaWorkflowPath('/w/settings.yaml')).toBe(false);
    expect(isNikaWorkflowPath('/w/nika.yaml.bak')).toBe(false);
    expect(isNikaWorkflowPath('/w/x.nikayaml')).toBe(false);
    expect(isNikaWorkflowPath('/w/README.md')).toBe(false);
    expect(isNikaWorkflowPath('/w/.nika')).toBe(false);
  });
});
