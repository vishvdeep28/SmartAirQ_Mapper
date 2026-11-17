import test from 'node:test';
import assert from 'node:assert/strict';
import { packetAge, ageLabel } from '../static/js/api.js';
import { calculateEnvironmentalScore } from '../static/js/scoring.js';
test('repeated polling does not make old packets fresh', () => {
  assert.equal(packetAge('2026-11-17 10:00:00','2026-11-17 11:00:00',10000,15000),3605);
  assert.equal(packetAge('2026-11-17 10:00:00','2026-11-17 11:00:03',13000,15000),3605);
  assert.equal(ageLabel(3605),'1h ago');
  assert.equal(packetAge('invalid','invalid',0,0),null);
});
test('environment score is bounded and invalid AQI is not excellent', () => {
  for (const aqi of [0,25,38,50,68,85,100,125,150,200,500]) {
    const score = calculateEnvironmentalScore(aqi,36,90);
    assert.ok(score.score >= 1 && score.score <= 10);
    assert.ok(score.penaltyApplied);
  }
  assert.equal(calculateEnvironmentalScore(null,20,40).score,null);
  assert.equal(calculateEnvironmentalScore(0,20,40).score,10);
  assert.equal(calculateEnvironmentalScore(500,45,90).climateAssessment.label,'Severe heat');
});
