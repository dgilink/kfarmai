(function(){
  async function loadAgriInfoContent(){
    const tasks = [];
    if(window.KFAgriVideos?.loadAgriVideos)tasks.push(window.KFAgriVideos.loadAgriVideos());
    if(window.KFAgriResearch?.loadAgriResearch)tasks.push(window.KFAgriResearch.loadAgriResearch());
    if(window.KFAgriIssues?.loadAgriIssues)tasks.push(window.KFAgriIssues.loadAgriIssues());
    await Promise.all(tasks);
  }

  window.KFAgriInfo = {
    loadAgriInfoContent
  };
  window.loadAgriInfoContent = loadAgriInfoContent;
})();
