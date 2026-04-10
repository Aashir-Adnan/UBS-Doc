export function isGranjurEmail(email) {
  const e = (email || '').toLowerCase();
  return (
    e.endsWith('@granjur.com') ||
    e.endsWith('@granjur,com') ||
    e === 'dev.alikhalil@gmail.com' ||
    e === 'usamaijaz2119@gmail.com'
  );
}
