 function loadProject(pid, publicId, onSuccess, onFailure) {
    var pid;
    if (pid) {
        data = { pid: pid };
    } else {
        data = { publicId: publicId };
    }
    // to prevent caching:
    data.gensym = Math.random();
    jQuery.ajax({cache : false,
               data : data,
               dataType: "json",
               type: "GET",
               url: "/loadProject",
               success: function(json) {
               onSuccess(new plt.wescheme.Program(json));
             },
               error: function(xhr) {
               onFailure(xhr.statusText);
             },
             xhr: function(settings) { return new XMLHttpRequest(settings); }
            });
};

export default loadProject