import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReleaseRef} from '../scripts/release-check.mjs';
test('branch and pull-request CI does not require a release tag',()=>{assert.equal(validateReleaseRef('1.0.0',{GITHUB_REF_TYPE:'branch',GITHUB_REF_NAME:'main'}),null);assert.equal(validateReleaseRef('1.0.0',{GITHUB_REF_TYPE:'branch',GITHUB_REF_NAME:'12/merge'}),null);});
test('release tag must exactly match the packaged semver',()=>{assert.equal(validateReleaseRef('1.0.0',{GITHUB_REF_TYPE:'tag',GITHUB_REF_NAME:'v1.0.0'}),'v1.0.0');assert.throws(()=>validateReleaseRef('1.0.0',{GITHUB_REF_TYPE:'tag',GITHUB_REF_NAME:'v1.0.1'}),/must be v1.0.0/);assert.throws(()=>validateReleaseRef('1.0.0',{SWCH_RELEASE_TAG:'v0.9.0'}));});
