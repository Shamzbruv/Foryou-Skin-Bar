(function () {
  const VISITOR_KEY_STORAGE = 'foryou_blog_visitor_key';

  function createVisitorKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function getVisitorKey() {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    try {
      const savedKey = window.localStorage.getItem(VISITOR_KEY_STORAGE);
      if (savedKey && uuidPattern.test(savedKey)) return savedKey;
      const newKey = createVisitorKey();
      window.localStorage.setItem(VISITOR_KEY_STORAGE, newKey);
      return newKey;
    } catch (error) {
      return createVisitorKey();
    }
  }

  function formatCommentDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Jamaica'
    }).format(date);
  }

  function renderComments(comments, list, countLabel) {
    list.replaceChildren();
    countLabel.textContent = String(comments.length);

    if (!comments.length) {
      const empty = document.createElement('p');
      empty.className = 'text-stone-500 py-5';
      empty.textContent = 'No comments yet. Start the conversation.';
      list.appendChild(empty);
      return;
    }

    comments.forEach(comment => {
      const item = document.createElement('article');
      item.className = 'border-b border-stone-200 py-5 last:border-0';

      const header = document.createElement('div');
      header.className = 'flex items-center justify-between gap-4 mb-2';

      const name = document.createElement('strong');
      name.className = 'text-stone-800';
      name.textContent = comment.author_name;

      const date = document.createElement('time');
      date.className = 'text-xs text-stone-500 shrink-0';
      date.dateTime = comment.created_at;
      date.textContent = formatCommentDate(comment.created_at);

      const text = document.createElement('p');
      text.className = 'text-stone-700 leading-7 whitespace-pre-wrap break-words';
      text.textContent = comment.comment_text;

      header.append(name, date);
      item.append(header, text);
      list.appendChild(item);
    });
  }

  window.initBlogEngagement = async function (post) {
    const root = document.getElementById('blogEngagement');
    if (!root) return;

    const likeButton = document.getElementById('blogLikeButton');
    const likeCount = document.getElementById('blogLikeCount');
    const form = document.getElementById('blogCommentForm');
    const nameInput = document.getElementById('commentName');
    const commentInput = document.getElementById('commentText');
    const submitButton = document.getElementById('commentSubmitButton');
    const status = document.getElementById('commentStatus');
    const commentList = document.getElementById('blogCommentList');
    const commentCount = document.getElementById('blogCommentCount');

    if (!window.supabase || !post?.id) {
      likeButton.disabled = true;
      submitButton.disabled = true;
      status.textContent = 'Likes and comments are temporarily unavailable.';
      return;
    }

    const visitorKey = getVisitorKey();
    let liked = false;

    function updateLikeButton() {
      likeButton.setAttribute('aria-pressed', String(liked));
      likeButton.classList.toggle('bg-amber-800', liked);
      likeButton.classList.toggle('text-white', liked);
      likeButton.classList.toggle('border-amber-800', liked);
      likeButton.classList.toggle('bg-white', !liked);
      likeButton.classList.toggle('text-stone-800', !liked);
      likeButton.querySelector('span').textContent = liked ? 'Liked' : 'Like this article';
      likeButton.querySelector('i').className = liked ? 'fas fa-heart' : 'far fa-heart';
    }

    async function loadLikes() {
      const [countResult, visitorResult] = await Promise.all([
        window.supabase.from('blog_likes').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
        window.supabase.from('blog_likes').select('id').eq('post_id', post.id).eq('visitor_key', visitorKey).limit(1)
      ]);
      if (countResult.error) throw countResult.error;
      if (visitorResult.error) throw visitorResult.error;
      liked = Boolean(visitorResult.data?.length);
      likeCount.textContent = String(countResult.count || 0);
      updateLikeButton();
    }

    async function loadComments() {
      const { data, error } = await window.supabase
        .from('blog_comments')
        .select('id,author_name,comment_text,created_at')
        .eq('post_id', post.id)
        .eq('is_visible', true)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      renderComments(data || [], commentList, commentCount);
    }

    likeButton.addEventListener('click', async () => {
      likeButton.disabled = true;
      try {
        const { data, error } = await window.supabase.rpc('toggle_blog_like', {
          p_post_id: post.id,
          p_visitor_key: visitorKey
        });
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        liked = Boolean(result?.liked);
        likeCount.textContent = String(result?.like_count ?? 0);
        updateLikeButton();
      } catch (error) {
        status.textContent = 'The like could not be saved. Please try again.';
      } finally {
        likeButton.disabled = false;
      }
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const authorName = nameInput.value.trim();
      const commentText = commentInput.value.trim();
      status.textContent = '';

      if (authorName.length < 2) {
        status.textContent = 'Please enter your name.';
        nameInput.focus();
        return;
      }
      if (!commentText) {
        status.textContent = 'Please enter a comment.';
        commentInput.focus();
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = 'Posting...';
      try {
        const { data: authData } = await window.supabase.auth.getUser();
        const { error } = await window.supabase.from('blog_comments').insert({
          post_id: post.id,
          author_name: authorName,
          comment_text: commentText,
          user_id: authData?.user?.id || null
        });
        if (error) throw error;
        commentInput.value = '';
        status.textContent = 'Your comment has been posted.';
        await loadComments();
      } catch (error) {
        status.textContent = 'Your comment could not be posted. Please try again.';
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Post comment';
      }
    });

    const results = await Promise.allSettled([loadLikes(), loadComments()]);
    if (results.some(result => result.status === 'rejected')) {
      status.textContent = 'Likes or comments could not be loaded. Please refresh and try again.';
    }
  };
})();
