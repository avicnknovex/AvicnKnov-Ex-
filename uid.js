// ✅ Supabase client reuse करो
const supabase = window.supabase.createClient(
  'https://hwrvqyipozrsxyjdpqag.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cnZxeWlwb3pyc3h5amRwcWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MDc2NzksImV4cCI6MjA2NjQ4MzY3OX0.s43NjpUGDAJhs9qEmnwIXEY5aOh3gl6XqPdEveodFZM'
);

async function loadUID() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      document.getElementById('user-id').value = "Unavailable";
      return;
    }

    const userId = user.id;

    const { data, error } = await supabase
      .from('uid')
      .select('uid')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      document.getElementById('user-id').value = "Unavailable";
      return;
    }

    if (data && data.uid) {
      document.getElementById('user-id').value = data.uid;
    } else {
      const newUID = generateUID();
      const { error: insertError } = await supabase
        .from('uid')
        .insert([{ user_id: userId, uid: newUID }]);

      if (insertError) {
        document.getElementById('user-id').value = "Unavailable";
      } else {
        document.getElementById('user-id').value = newUID;
      }
    }
  } catch (e) {
    console.error("UID error:", e);
    document.getElementById('user-id').value = "Unavailable";
  }
}

function generateUID() {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

loadUID();