const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;
const fs = require('fs');
const path = require('path');

const sourceIcon = path.join(__dirname, '..', 'resources', 'icon-source.png');
const outputIcon = path.join(__dirname, '..', 'resources', 'icon.ico');

pngToIco(sourceIcon)
  .then(buf => {
    fs.writeFileSync(outputIcon, buf);
    console.log('icon.ico generated successfully!');
  })
  .catch(err => {
    console.error('Error generating icon.ico:', err);
  });
