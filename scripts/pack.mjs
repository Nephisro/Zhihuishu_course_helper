import './check.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { root, runtimeFiles, sourceFiles, readText } from './files.mjs';
import { createZip } from './archive.mjs';

const { version } = JSON.parse(await readText('package.json'));
const prefix = 'zhihuishu-course-helper/';
const destination = join(root, 'dist');
await mkdir(destination, { recursive: true });
const source = await sourceFiles();
const installEntries = await Promise.all(runtimeFiles.map(async name => ({ name: prefix + name, content: await readText(`extension/${name}`) })));
installEntries.push({ name: prefix + 'README.md', content: `# 智慧树课程助手 v${version}\n\nChrome 118 或更高版本。在 chrome://extensions/ 中开启开发者模式，点击“加载已解压的扩展程序”，选择此文件夹（包含 manifest.json），然后刷新课程页。\n\n详细用法、权限和限制见同版本源码包中的 README.md。API Key 需要在扩展设置中自行填写，安装包不含个人配置。长期后台运行尚未验证，建议保持课程标签页选中且 Chrome 不最小化。\n` });
if (source.includes('LICENSE')) installEntries.push({ name: prefix + 'LICENSE', content: await readText('LICENSE') });
const sourceEntries = await Promise.all(source.map(async name => ({ name: prefix + name, content: await readText(name) })));
const packages = [
  { name: `zhihuishu-course-helper-v${version}.zip`, entries: installEntries },
  { name: `zhihuishu-course-helper-source-v${version}.zip`, entries: sourceEntries },
];
const sums = [];
for (const archive of packages) {
  const bytes = createZip(archive.entries);
  await writeFile(join(destination, archive.name), bytes);
  sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${archive.name}`);
  console.log(`${archive.name}: ${archive.entries.length} files, ${bytes.length} bytes`);
}
await writeFile(join(destination, 'SHA256SUMS.txt'), sums.join('\n') + '\n', 'utf8');
console.log('Archives and SHA256SUMS.txt written to dist/. No remote upload performed.');
