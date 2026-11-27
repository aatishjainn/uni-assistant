const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT_DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// "Now" as the university sees it (not the server's own clock/timezone).
function nowInTz(tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  const dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[get('weekday')];
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { dow, time: `${hour}:${get('minute')}`, date: `${get('year')}-${get('month')}-${get('day')}` };
}

function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// Returns Monday (YYYY-MM-DD) of the ISO week containing dateStr.
function getWeekStart(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const jsDay = dt.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  return dt.toISOString().slice(0, 10);
}

function getCurrentWeekStart(tz) {
  return getWeekStart(nowInTz(tz).date);
}

function getWeekDatesForDays(weekStart, daysOfWeek) {
  const uniqueDows = [...new Set((daysOfWeek || []).map(Number).filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b);
  const effective = uniqueDows.length > 0 ? uniqueDows : [1, 2, 3, 4, 5];
  return effective.map((dow) => ({
    date: addDays(weekStart, dow - 1),
    day_of_week: dow,
    day_name: DAY_NAMES[dow],
    short_day: SHORT_DAY_NAMES[dow],
  }));
}

module.exports = {
  DAY_NAMES,
  SHORT_DAY_NAMES,
  nowInTz,
  addDays,
  getWeekStart,
  getCurrentWeekStart,
  getWeekDatesForDays,
};
