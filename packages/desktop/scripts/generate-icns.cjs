const png2icons = require('png2icons');
const fs = require('fs');
const path = require('path');

const sourceIcon = path.join(__dirname, '..', 'resources', 'icon-source.png');
const outputIcon = path.join(__dirname, '..', 'resources', 'icon.icns');

const input = fs.readFileSync(sourceIcon);
const output = png2icons.createICNS(input, png2icons.BILINEAR, 0);

if (output) {
  fs.writeFileSync(outputIcon, output);
  console.log('icon.icns generated successfully!');
} else {
  console.error('Error generating icon.icns');
}
