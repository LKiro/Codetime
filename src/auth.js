const crypto = require('crypto');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;

function hashToken(token) {
  const pepper = process.env.TOKEN_PEPPER || '';
  return crypto.createHash('sha256').update(token + pepper, 'utf8').digest('hex');
}

function initPassport(store) {
  const clientID = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const callbackURL = process.env.GITHUB_CALLBACK_URL;
  if (!clientID || !clientSecret || !callbackURL) {
    return; // OAuth not configured
  }
  passport.use(new GitHubStrategy({ clientID, clientSecret, callbackURL }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Map GitHub user to local user
      const username = profile.username || (profile.emails && profile.emails[0] && profile.emails[0].value) || `gh_${profile.id}`;
      const userId = await store.getOrCreateUserByUsername(username);
      return done(null, { id: userId, username });
    } catch (e) {
      return done(e);
    }
  }));
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));
}

module.exports = { hashToken, initPassport };

