// workflowName.test.ts — lexical source identity (#1684). Pure, no I/O.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PROJECT_FILE,
  WORKFLOW_GLOB,
  WORKFLOW_GOLDEN_GLOB,
  WORKFLOW_SUFFIX,
  isCanonicalWorkflowFilename,
  isCanonicalWorkflowPath,
  isLegacyWorkflowPath,
  workflowLogicalStem,
  withWorkflowSuffix,
} from '../core/workflowName';

describe('canonical naming contract', () => {
  it('uses exact lowercase .nika, a nonempty stem, and a program glob', () => {
    expect(WORKFLOW_SUFFIX).toBe('.nika');
    expect(WORKFLOW_GLOB).toBe('**/*.nika');
    expect(WORKFLOW_GOLDEN_GLOB).toBe('**/*.nika.golden.json');
    expect(withWorkflowSuffix('support-triage')).toBe('support-triage.nika');
    expect(withWorkflowSuffix('support-triage.nika')).toBe('support-triage.nika');
    expect(isCanonicalWorkflowPath(withWorkflowSuffix(''))).toBe(false);
  });

  it.each([
    ['foo.nika', true],
    ['support.v2.nika', true],
    ['nested/daily.nika', true],
    ['/abs/lib.nika', true],
    ['./deploy.nika', true],
    ['file:///work/parent.nika', true],
    ['FOO.nika', true],
  ])('accepts canonical program path %s', (path, ok) => {
    expect(isCanonicalWorkflowPath(path)).toBe(ok);
  });

  it.each([
    'foo.nika.yaml',
    'foo.nika.yml',
    'foo.yaml',
    'foo.yml',
    'nika.yaml',
    'foo.nika.evil',
    'foo.nika.minisig',
    'foo.nika.golden.json',
    'foo.NIKA',
    'foo.Nika',
    '.nika',
    'foo.nika/',
    'something.nika/',
    'foo.nika.yaml.evil',
    'foo.nika?evil',
    'foo.nika#fragment',
    'foo.nika\u007f',
    '',
    'notes.txt',
  ])('rejects %s', (path) => {
    expect(isCanonicalWorkflowPath(path)).toBe(false);
  });

  it('does not case-fold the suffix even on mixed-case paths', () => {
    expect(isCanonicalWorkflowPath('/W/DAILY.NIKA.YAML')).toBe(false);
    expect(isCanonicalWorkflowPath('/W/DAILY.NIKA')).toBe(false);
    expect(isCanonicalWorkflowFilename('DAILY.NIKA')).toBe(false);
  });

  it('strips only the canonical suffix from a compound stem', () => {
    expect(workflowLogicalStem('support.v2.nika')).toBe('support.v2');
    expect(workflowLogicalStem('support.nika')).toBe('support');
    expect(workflowLogicalStem('support.nika.yaml')).toBeUndefined();
    expect(workflowLogicalStem('.nika')).toBeUndefined();
  });

  it('classifies retired aliases without accepting them as live programs', () => {
    expect(isLegacyWorkflowPath('foo.nika.yaml')).toBe(true);
    expect(isLegacyWorkflowPath('foo.nika.yml')).toBe(true);
    expect(isLegacyWorkflowPath('foo.nika')).toBe(false);
    expect(isLegacyWorkflowPath('nika.yaml')).toBe(false);
  });

  it('treats nika.yaml as the project file, never a program, regardless of bytes', () => {
    expect(PROJECT_FILE).toBe('nika.yaml');
    expect(WORKFLOW_GLOB.includes(PROJECT_FILE)).toBe(false);
    expect(isCanonicalWorkflowPath(PROJECT_FILE)).toBe(false);
    expect(isCanonicalWorkflowFilename(PROJECT_FILE)).toBe(false);
    expect(isCanonicalWorkflowPath(`/repo/${PROJECT_FILE}`)).toBe(false);
    expect(isLegacyWorkflowPath(PROJECT_FILE)).toBe(false);
    expect(workflowLogicalStem(PROJECT_FILE)).toBeUndefined();
  });

  it('is lexical: a directory form is never a program name', () => {
    expect(isCanonicalWorkflowPath('workflows.nika/')).toBe(false);
    expect(isCanonicalWorkflowPath('.nika/')).toBe(false);
  });

  it('package.json language association matches the canonical suffix', () => {
    const pkg = JSON.parse(readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'),
      'utf8',
    ));
    const language = pkg.contributes.languages.find((entry: { id: string }) => entry.id === 'nika');
    expect(language.extensions).toEqual(['.nika']);
    expect(language.filenamePatterns).toEqual(['*.nika']);
    expect(pkg.contributes.configurationDefaults['files.associations']).toEqual({ '*.nika': 'nika' });
    expect(pkg.activationEvents).toContain('workspaceContains:**/*.nika');
  });
});
