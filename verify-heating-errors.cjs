const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const ts = require('typescript');
const rxjs = require('rxjs');
function loadSource(path, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true,
  }}).outputText;
  vm.runInNewContext(code, {exports, require: name => name in imports ? imports[name] : require(name), console});
  return exports;
}
const {RestApiService} = loadSource('src/app/@core/utils/rest-api.service.ts', {
  '@angular/core': {Injectable: () => value => value},
  '@angular/common/http': {HttpHeaders: class {}},
  '../../../environments/environment': {environment: {appUrl: 'http://127.0.0.1:8000/api'}},
  './project-context.service': {},
});
const {describeHeatingProfileError: describe} = loadSource('src/app/pages/networks/load-profile-comparison/heating-profile-errors.ts');
const failure = {status: 400, error: {detail: ['Select a network or at most 500 building IDs for a reproducible comparison.']}};
const service = new RestApiService({post: () => rxjs.throwError(failure)}, {});
let received;
service.post({}, 'heating-profile-comparison/').subscribe({error: error => received = error});
assert.strictEqual(received, failure, 'API service must preserve the server error object');
assert.match(describe(received), /at most 500/);
assert.match(describe({status: 0}), /Cannot reach/);
assert.match(describe({status: 401}), /Sign in again/);
assert.match(describe({status: 403}), /permission/);
assert.match(describe({status: 404}), /unavailable/);
assert.match(describe({status: 500, error: '<html>Traceback secret</html>'}), /HTTP 500/);
assert.ok(!describe({status: 500, error: '<html>Traceback secret</html>'}).includes('secret'));
assert.strictEqual(describe({status: 400, error: {year: ['Use a completed year.']}}), 'year: Use a completed year.');
assert.strictEqual(describe({status: 503, error: {detail: 'Weather unavailable; retry later.'}}), 'Weather unavailable; retry later.');
assert.strictEqual(describe('Specific error'), 'Specific error');
console.log('Passed: API error propagation and 10 error-message checks.');
const {peakWeekBounds, modelVisual, buildMetricChart} = loadSource('src/app/pages/networks/load-profile-comparison/heating-profile-charts.ts');
assert.deepStrictEqual(Array.from(peakWeekBounds([9,...Array(199).fill(0)])),[0,168]);
assert.deepStrictEqual(Array.from(peakWeekBounds([...Array(199).fill(0),9])),[32,200]);
const example={results:[{model:'hdd_daily_ca_v1',metrics:{peak_kw:10}},{model:'heat_balance_ca_v1',metrics:{peak_kw:12}}]};
const subset={...example,results:example.results.filter(r=>r.model!=='hdd_daily_ca_v1')};
const chart=buildMetricChart(subset,'peak_kw','kW');
assert.strictEqual(chart.series[0].data[0].itemStyle.color,modelVisual('heat_balance_ca_v1').color);
assert.strictEqual(chart.series[0].data[0].value,subset.results[0].metrics.peak_kw);
assert.strictEqual(chart.xAxis.min,0);
console.log('Passed: peak-window boundaries, stable colors and chart source values.');
