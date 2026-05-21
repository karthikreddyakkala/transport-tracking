const dns = require('dns');

const originalLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  
  if (hostname && (hostname.includes('neon.tech') || hostname.includes('mapbox.com'))) {
    const { Resolver } = require('dns');
    const resolver = new Resolver();
    resolver.setServers(['8.8.8.8']);
    resolver.resolve4(hostname, (err, addresses) => {
      if (err) return originalLookup(hostname, options, callback);
      if (addresses && addresses.length > 0 && typeof addresses[0] === 'string') {
        const ip = addresses[0];
        if (options && options.all) {
          callback(null, [{ address: ip, family: 4 }]);
        } else {
          callback(null, ip, 4);
        }
      } else {
        originalLookup(hostname, options, callback);
      }
    });
    return;
  }
  
  return originalLookup(hostname, options, callback);
};
