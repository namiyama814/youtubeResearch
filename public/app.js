const form = document.querySelector('#search-form');
const input = document.querySelector('#query');
const results = document.querySelector('#results');
const template = document.querySelector('#card-template');

const number = new Intl.NumberFormat('ja-JP');
const date = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });

function setStatus(markup) { results.innerHTML = markup; }

function createCard(video) {
  const card = template.content.cloneNode(true);
  const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
  const channelUrl = `https://www.youtube.com/channel/${encodeURIComponent(video.channel.id)}`;
  card.querySelector('.thumb-link').href = videoUrl;
  card.querySelector('.thumbnail').src = video.thumbnail;
  card.querySelector('.thumbnail').alt = video.title;
  card.querySelector('.date').textContent = date.format(new Date(video.publishedAt));
  card.querySelector('.subscriber-count').textContent = `登録者 ${number.format(video.channel.subscribers)}人`;
  const title = card.querySelector('.video-title'); title.href = videoUrl; title.textContent = video.title;
  const channel = card.querySelector('.channel'); channel.href = channelUrl;
  card.querySelector('.channel-image').src = video.channel.thumbnail;
  card.querySelector('.channel-image').alt = '';
  card.querySelector('.channel-name').textContent = video.channel.title;
  return card;
}

function render(videos, query, nextPageToken, publishedAfter) {
  if (!videos.length) {
    setStatus(`<div class="empty-state"><div class="empty-icon">◌</div><p>「${escapeHtml(query)}」に合う動画は見つかりませんでした</p><small>別のキーワードで試してみてください。</small></div>`);
    return;
  }
  results.innerHTML = `<div class="result-heading"><p><strong>${number.format(videos.length)}件</strong>の動画を表示中</p></div><div class="video-grid"></div>${nextPageToken ? '<div class="more-wrap"><button class="more-button" type="button">さらに表示</button></div>' : ''}`;
  const grid = results.querySelector('.video-grid');
  videos.forEach((video) => grid.append(createCard(video)));
  const moreButton = results.querySelector('.more-button');
  if (!moreButton) return;
  moreButton.dataset.query = query;
  moreButton.dataset.pageToken = nextPageToken;
  moreButton.dataset.publishedAfter = publishedAfter;
  moreButton.addEventListener('click', () => loadMore(moreButton));
}

async function loadMore(button) {
  const { query, pageToken, publishedAfter } = button.dataset;
  button.disabled = true;
  button.innerHTML = '検索中…';
  try {
    const params = new URLSearchParams({ q: query, pageToken, publishedAfter });
    const response = await fetch(`/api/search?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '検索に失敗しました。');
    const grid = results.querySelector('.video-grid');
    data.videos.forEach((video) => grid.append(createCard(video)));
    results.querySelector('.result-heading strong').textContent = `${number.format(grid.children.length)}件`;
    if (!data.nextPageToken) {
      button.parentElement.remove();
    } else {
      button.disabled = false;
      button.innerHTML = 'さらに表示';
      button.dataset.pageToken = data.nextPageToken;
    }
  } catch (error) {
    button.disabled = false;
    button.innerHTML = '再試行 <span></span>';
    button.querySelector('span').textContent = escapeHtml(error.message);
  }
}

function escapeHtml(value) { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;
  const button = form.querySelector('button');
  button.disabled = true; button.innerHTML = '検索中…';
  setStatus('<div class="loading"><i></i><p>YouTubeを検索しています</p></div>');
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '検索に失敗しました。');
    render(data.videos, query, data.nextPageToken, data.publishedAfter);
  } catch (error) {
    setStatus(`<div class="error-state"><p>検索できませんでした</p><small>${escapeHtml(error.message)}</small></div>`);
  } finally {
    button.disabled = false; button.innerHTML = '検索する <span>→</span>';
  }
});
