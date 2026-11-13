import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import base from './playwright.config.mjs';
const here=dirname(fileURLToPath(import.meta.url));
export default defineConfig({
 testDir:here,
 testMatch:'*.w62.mjs',
 timeout:120_000,
 expect:{timeout:10_000},
 retries:0,
 workers:2,
 fullyParallel:true,
 reporter:[['list'],['json',{outputFile:resolve(here,'w62-results.json')}],
  ['html',{outputFolder:resolve(here,'w62-report'),open:'never'}]],
 outputDir:resolve(here,'w62-test-results'),
 use:{trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:base.projects,
});
