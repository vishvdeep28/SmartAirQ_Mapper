/** Project-specific environment indicator; intentionally not a regulatory AQI scale. */
export function calculateEnvironmentalScore(aqi, temp, humidity) {
  if (typeof aqi !== 'number' || !Number.isFinite(aqi) || aqi < 0) return {
    score: null, category: 'Unavailable', aqiColorHex: '#829697', penaltyApplied: false,
    advisoryTitle: 'No valid AQI reading', advisoryText: 'Check the sensor connection to restore the environment indicator.',
    climateAssessment: { label: 'Unavailable', heatIndex: null }
  };
  const baseScore = aqi <= 25 ? 10 : aqi <= 50 ? 9 : aqi <= 75 ? 8 : aqi <= 100 ? 7 : aqi <= 150 ? 6 : aqi <= 200 ? 5 : aqi <= 250 ? 4 : aqi <= 300 ? 3 : aqi <= 350 ? 2 : aqi <= 400 ? 1 : 0;
  const penaltyApplied = temp > 35 && humidity > 85;
  const score = Math.max(0, baseScore - Number(penaltyApplied));
  const category = score >= 9 ? 'Excellent' : score >= 7 ? 'Good' : score >= 5 ? 'Moderate' : score >= 3 ? 'Needs attention' : 'Elevated pollution';
  const aqiColorHex = score >= 9 ? '#16866d' : score >= 7 ? '#47977c' : score >= 5 ? '#c4a04d' : score >= 3 ? '#d58a50' : '#cf655a';
  let heatIndex = typeof temp === 'number' && Number.isFinite(temp) ? temp : null;
  if (heatIndex !== null && temp >= 26 && humidity >= 40) {
    heatIndex = -8.78469475556 + 1.61139411*temp + 2.33854883889*humidity - 0.14611605*temp*humidity - 0.012308094*temp*temp - 0.0164248277778*humidity*humidity + 0.002211732*temp*temp*humidity + 0.00072546*temp*humidity*humidity - 0.000003582*temp*temp*humidity*humidity;
  }
  const label = heatIndex === null ? 'Unavailable' : heatIndex >= 54 ? 'Severe heat' : heatIndex >= 40 ? 'High heat' : heatIndex >= 32 ? 'Warm / humid' : temp < 18 ? 'Cool' : 'Comfortable';
  return {
    score, baseScore, category, aqiColorHex, penaltyApplied,
    advisoryTitle: score >= 7 ? 'A clearer picture of your surroundings.' : 'Keep an eye on changing conditions.',
    advisoryText: score >= 7 ? 'Your project indicator is in a favorable range. Keep monitoring for changes across locations and over time.' : 'Your project indicator has dropped. Review recent measurements and consult your local official air quality service for health guidance.',
    climateAssessment: { label, heatIndex: heatIndex === null ? null : Math.round(heatIndex * 10) / 10 }
  };
}
