const fs = require('fs');
const files = ['client/src/pages/LoginPage.tsx', 'client/src/pages/RegisterPage.tsx'];

for (const file of files) {
  let c = fs.readFileSync(file, 'utf8');
  
  const regex = /const handleGoogleLogin = \(\) => \{\r?\n\s+if \(\!config\?\.googleOAuth\?\.clientId\) return;\r?\n\s+const redirectUri = window\.location\.origin \+ '\/auth\/google\/callback';\r?\n\s+const googleAuthUrl = `https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?client_id=\$\{config\.googleOAuth\.clientId\}&redirect_uri=\$\{encodeURIComponent\(redirectUri\)\}&response_type=code&scope=email%20profile&access_type=offline&prompt=consent`;\r?\n\s+window\.location\.href = googleAuthUrl;\r?\n\s+\};/;

  const replacement = `const handleGoogleLogin = async () => {
    if (!config?.googleOAuth?.clientId) return;
    try {
      const res = await fetch('/api/auth/state');
      if (!res.ok) throw new Error('Failed to fetch state');
      const { state } = await res.json();
      const redirectUri = window.location.origin + '/auth/google/callback';
      const googleAuthUrl = \`https://accounts.google.com/o/oauth2/v2/auth?client_id=\${config.googleOAuth.clientId}&redirect_uri=\${encodeURIComponent(redirectUri)}&response_type=code&scope=email%20profile&access_type=offline&prompt=consent&state=\${state}\`;
      window.location.href = googleAuthUrl;
    } catch (err) {
      setError('Failed to initiate Google login');
    }
  };`;

  if (regex.test(c)) {
    c = c.replace(regex, replacement);
    fs.writeFileSync(file, c);
    console.log(file + ' updated');
  } else {
    console.log(file + ' not matched');
  }
}
