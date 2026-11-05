const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

module.exports = { DAY_NAMES, nowInTz };
