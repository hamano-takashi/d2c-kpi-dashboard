// Run inside the Render service to verify Node's outbound HTTPS trust store.
// Requests contain no credentials and only target the advisory's fixed URLs.
const certificateErrors = new Set([
  'CERT_REVOKED',
  'CERT_SIGNATURE_FAILURE',
  'CERT_UNTRUSTED',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

const targets = [
  { url: 'https://render.com/', expected: 'accepted' },
  { url: 'https://dv-g3b-emudhra.we-have-a-problem.com/', expected: 'rejected' },
  { url: 'https://dv-g3b-aaa-emudhra.we-have-a-problem.com/', expected: 'rejected' },
];

console.log('[TLS verification] ' + JSON.stringify({
  node: process.version,
  openssl: process.versions.openssl,
  render: process.env.RENDER === 'true',
  commit: process.env.RENDER_GIT_COMMIT || null,
  client: 'Node built-in fetch',
  verificationDisabled: process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0',
  extraCaConfigured: Boolean(process.env.NODE_EXTRA_CA_CERTS),
}));

const results = await Promise.all(targets.map(async ({ url, expected }) => {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    await response.body?.cancel();
    return { url, expected, actual: 'accepted', status: response.status };
  } catch (error) {
    const code = error.cause?.code || error.code || error.name;
    return {
      url,
      expected,
      actual: certificateErrors.has(code) ? 'rejected' : 'inconclusive',
      code,
    };
  }
}));

for (const result of results) {
  console.log('[TLS verification] ' + JSON.stringify(result));
}

const passed = results.every(({ expected, actual }) => expected === actual);
console.log('[TLS verification] ' + (passed ? 'PASS' : 'FAIL OR INCONCLUSIVE'));
process.exitCode = passed ? 0 : 1;
