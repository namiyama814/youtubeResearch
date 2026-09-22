const json = (body, status = 200) => Response.json(body, { status });

async function youtube(apiKey, endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [key, value] of Object.entries({ ...params, key: apiKey })) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || 'YouTube API との通信に失敗しました。');
  return body;
}

async function searchVideos(apiKey, query, pageToken, publishedAfter) {
  const searchAfter = publishedAfter || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const search = await youtube(apiKey, 'search', {
    part: 'snippet', q: query, type: 'video', order: 'date',
    regionCode: 'JP', relevanceLanguage: 'ja', publishedAfter: searchAfter,
    maxResults: '50', ...(pageToken ? { pageToken } : {})
  });
  const items = (search.items || []).filter((item) => item.id?.videoId);
  if (!items.length) return { videos: [], publishedAfter: searchAfter, nextPageToken: search.nextPageToken || null };

  const channelIds = [...new Set(items.map((item) => item.snippet.channelId))];
  const channels = await youtube(apiKey, 'channels', { part: 'snippet,statistics', id: channelIds.join(',') });
  const channelById = new Map((channels.items || []).map((channel) => [channel.id, channel]));
  const videos = items.flatMap((item) => {
    const channel = channelById.get(item.snippet.channelId);
    const subscribers = Number(channel?.statistics?.subscriberCount);
    if (!Number.isFinite(subscribers) || subscribers < 500 || subscribers > 10000) return [];
    return [{
      id: item.id.videoId, title: item.snippet.title, description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      channel: { id: channel.id, title: channel.snippet.title, thumbnail: channel.snippet.thumbnails?.default?.url, subscribers }
    }];
  });
  return { videos, publishedAfter: searchAfter, nextPageToken: search.nextPageToken || null };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const query = url.searchParams.get('q')?.trim();
  if (!query) return json({ error: '検索キーワードを入力してください。' }, 400);
  if (!context.env.YOUTUBE_API_KEY) return json({ error: 'YouTube APIキーが設定されていません。' }, 500);
  try {
    return json(await searchVideos(
      context.env.YOUTUBE_API_KEY,
      query,
      url.searchParams.get('pageToken'),
      url.searchParams.get('publishedAfter')
    ));
  } catch (error) {
    return json({ error: error.message }, 500);
  }
}
