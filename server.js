const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Load local development settings without adding a dependency. Environment values
// supplied by the deployment platform always take precedence over .env values.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}

const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.YOUTUBE_API_KEY;

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function youtube(endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [key, value] of Object.entries({ ...params, key: apiKey })) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) {
    const message = body?.error?.message || 'YouTube API との通信に失敗しました。';
    throw new Error(message);
  }
  return body;
}

async function searchVideos(query, pageToken, publishedAfter) {
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY が設定されていません。README の手順を確認してください。');
  }

  const searchAfter = publishedAfter || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const videos = [];
  const search = await youtube('search', {
    part: 'snippet',
    q: query,
    type: 'video',
    order: 'date',
    regionCode: 'JP',
    relevanceLanguage: 'ja',
    publishedAfter: searchAfter,
    maxResults: '50',
    ...(pageToken ? { pageToken } : {})
  });
  const items = (search.items || []).filter((item) => item.id?.videoId);
  if (items.length) {
    const channelIds = [...new Set(items.map((item) => item.snippet.channelId))];
    const channels = await youtube('channels', { part: 'snippet,statistics', id: channelIds.join(',') });
    const channelById = new Map((channels.items || []).map((channel) => [channel.id, channel]));
    for (const item of items) {
      const channel = channelById.get(item.snippet.channelId);
      const subscribers = Number(channel?.statistics?.subscriberCount);
      // Hidden subscriber counts are intentionally excluded: the condition cannot be verified.
      if (!Number.isFinite(subscribers) || subscribers < 500 || subscribers > 10000) continue;
      videos.push({
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        channel: { id: channel.id, title: channel.snippet.title, thumbnail: channel.snippet.thumbnails?.default?.url, subscribers }
      });
    }
  }

  return { videos, publishedAfter: searchAfter, nextPageToken: search.nextPageToken || null };
}

function serveFile(res, pathname) {
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  const resolved = path.resolve(publicDir, file);
  if (!resolved.startsWith(publicDir) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
  res.writeHead(200, { 'Content-Type': types[path.extname(resolved)] || 'application/octet-stream' });
  fs.createReadStream(resolved).pipe(res);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/search') {
    const query = url.searchParams.get('q')?.trim();
    if (!query) return json(res, 400, { error: '検索キーワードを入力してください。' });
    try { return json(res, 200, await searchVideos(query, url.searchParams.get('pageToken'), url.searchParams.get('publishedAfter'))); }
    catch (error) { return json(res, 500, { error: error.message }); }
  }
  serveFile(res, url.pathname);
}).listen(port, () => console.log(`YouTube Researcher: http://localhost:${port}`));
