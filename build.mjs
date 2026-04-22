/**
 * Anti YouTube Shorts — esbuild バンドルスクリプト
 * 各エントリポイントをIIFE形式でバンドルし dist/ へ出力する
 */
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

/** @type {esbuild.BuildOptions} */
const sharedConfig = {
	bundle: true,
	format: 'iife',
	minify: isProduction,
	sourcemap: !isProduction,
	target: ['chrome100', 'edge100'],
	charset: 'utf8',
	logLevel: 'info',
};

/**
 * 静的リソース（assets, popup.html, popup.css, content CSS, manifest）を dist/ へコピー
 */
function copyStaticAssets() {
	const distDir = resolve(__dirname, 'dist');
	if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

	// assets/
	cpSync(resolve(__dirname, 'assets'), resolve(distDir, 'assets'), { recursive: true });

	// manifest.json
	cpSync(resolve(__dirname, 'manifest.json'), resolve(distDir, 'manifest.json'));

	// popup HTML / CSS
	const popupDir = resolve(distDir, 'popup');
	if (!existsSync(popupDir)) mkdirSync(popupDir, { recursive: true });
	cpSync(resolve(__dirname, 'popup', 'popup.html'), resolve(popupDir, 'popup.html'));
	cpSync(resolve(__dirname, 'popup', 'popup.css'), resolve(popupDir, 'popup.css'));

	// content_scripts CSS
	const contentDir = resolve(distDir, 'content_scripts');
	if (!existsSync(contentDir)) mkdirSync(contentDir, { recursive: true });
	cpSync(
		resolve(__dirname, 'content_scripts', 'anti-shorts.css'),
		resolve(contentDir, 'anti-shorts.css'),
	);

	console.log('[build] 静的リソースをコピー完了');
}

async function build() {
	copyStaticAssets();

	/** @type {esbuild.BuildOptions[]} */
	const entries = [
		{
			...sharedConfig,
			entryPoints: [resolve(__dirname, 'src', 'background', 'index.ts')],
			outfile: resolve(__dirname, 'dist', 'background.js'),
		},
		{
			...sharedConfig,
			entryPoints: [resolve(__dirname, 'src', 'popup', 'popup.ts')],
			outfile: resolve(__dirname, 'dist', 'popup', 'popup.js'),
		},
		{
			...sharedConfig,
			entryPoints: [resolve(__dirname, 'src', 'content', 'index.ts')],
			outfile: resolve(__dirname, 'dist', 'content_scripts', 'anti-shorts.js'),
		},
	];

	if (isWatch) {
		const contexts = await Promise.all(entries.map((entry) => esbuild.context(entry)));
		await Promise.all(contexts.map((ctx) => ctx.watch()));
		console.log('[build] ウォッチモード起動中...');
	} else {
		await Promise.all(entries.map((entry) => esbuild.build(entry)));
		console.log('[build] ビルド完了');
	}
}

build().catch((err) => {
	console.error('[build] ビルド失敗:', err);
	process.exit(1);
});
