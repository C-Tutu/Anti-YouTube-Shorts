
const params = new URLSearchParams(location.search);
const short_id = params.get("short_id");
let open_video_id;
if (short_id) {
    open_video_id=decodeURIComponent(short_id);
}
const OPEN_ID=document.getElementById("open-short-embed")
OPEN_ID.innerHTML='<a href="https://www.youtube.com/watch?v='+open_video_id+'"><h1>視聴する</h1></a>'