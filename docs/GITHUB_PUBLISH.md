# GitHub 发布说明

本文件提供上传步骤，打包过程没有创建远程仓库或上传任何文件。

## 推荐仓库内容

上传当前项目目录中的 `extension/`、`tests/`、`scripts/`、`docs/`、`.github/`、`.gitignore`、`.gitattributes`、`package.json`、`README.md`、`CHANGELOG.md` 和 `LICENSE`。不把安装 ZIP 作为唯一的仓库内容。

`dist/` 是生成目录，已由 `.gitignore` 排除。面向用户的安装 ZIP 放在 GitHub Release 的附件中。项目采用 MIT License，分发时应保留 `LICENSE` 中的版权与许可声明。

## 方式一：通过 Git 上传

在 GitHub 创建一个空仓库，复制仓库 URL。在当前项目目录打开终端，依次执行：

```sh
git init -b main
git add .
git commit -m "Initial release v1.6.1"
```

将下方占位值替换为自己的远程仓库地址，然后执行：

```sh
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

仓库如已有内容，应先克隆该仓库再复制本项目文件进去，不直接覆盖远程分支。

## 方式二：网页上传

在 GitHub 创建仓库，在仓库中选择 Add file → Upload files，上传解压后的项目文件及文件夹。确认 `.github/`、`.gitignore` 等点号开头的文件也被包含。不要只上传项目 ZIP，否则 GitHub 不会直接显示源码或执行工作流。

## 创建 v1.6.1 Release

1. 先执行 `node scripts/check.mjs`、`node --test`、`node scripts/pack.mjs`。
2. 在仓库 Releases 中创建版本，标签填写 `v1.6.1`，目标选择已上传的主分支。
3. 标题可填写“v1.6.1：修复测试提交后的自动返回”。说明可摘自 `CHANGELOG.md`，保留“尚未验证长期后台及连续运行”的限制。
4. 附加 `dist/zhihuishu-course-helper-v1.6.1.zip` 和 `dist/SHA256SUMS.txt`；按需附加源码 ZIP。
5. 检查内容后自行发布。

用户从源码安装时加载 `extension/`；从 Release 安装包安装时加载解压后的 `zhihuishu-course-helper/`。完整说明见仓库 README。

## 后续版本

同步修改 `extension/manifest.json` 与 `package.json` 的版本，更新 `CHANGELOG.md`，重新检查、测试和打包。版本号不一致时检查脚本会拒绝打包。
