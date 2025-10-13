function parseRange(range) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  const end = new Date(today);
  if (range === 'today') {
    end.setDate(end.getDate() + 1);
  } else if (range === 'yesterday') {
    start.setDate(start.getDate() - 1);
  } else if (range === 'last3d') {
    start.setDate(start.getDate() - 2);
    end.setDate(end.getDate() + 1);
  } else if (range === 'last7d') {
    start.setDate(start.getDate() - 6);
    end.setDate(end.getDate() + 1);
  } else {
    return null;
  }
  return { start, end };
}

function isValidProjectName(name) {
  if (typeof name !== 'string') return false;
  if (name.length < 1 || name.length > 100) return false;
  return /^[A-Za-z0-9._-]+$/.test(name);
}

module.exports = { parseRange, isValidProjectName };

