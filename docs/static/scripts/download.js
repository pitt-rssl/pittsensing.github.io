  // Event listener for download all option 
  $("#download-all").on('change', function() {
    var download_all = $("#download-all").is(":checked");
    if (download_all) {
      $("#start-time").attr("disabled", true);
      $("#end-time").attr("disabled", true);
    }
    else {
      $("#start-time").attr("disabled", false);
      $("#end-time").attr("disabled", false);
    }
  });

  // Download PittSensing data based on user selections
  $("#download-button").on('click', function(e) {
    // Load spinner
    load_spinner();

    // Package data
    var name = $("#name").val();
    var email = $("#email").val();
    var comments = $("#comments").val();

    var dataset = $("#datasets").val();
    var filename = `${dataset}.csv`;
    var data = {
        'name': name,
        'email': email,
        'comments': comments,
        'filename': filename,
        'dataset': dataset
    };
    var download_all = $("#download-all").is(":checked");
    if (!download_all) {
        var start_time = $("#start-time").val();
        var end_time = $("#end-time").val();
        data['start'] = start_time;
        data['end'] = end_time;
    }

    // Send request for latest data
    $.ajax({
        url: '/data',
        type: 'POST',
        data: JSON.stringify(data),
        contentType: "application/json",
        dataType: 'json',
        success: function(data) {  
            if (!('error' in data)) {
                var job_id = data['job_id'];

                // Poll the status of the download
                function pollLatestData() {
                    $.ajax({
                        url: `/data/${job_id}`,
                        type: 'GET',
                        async: false,
                        success: function(data) {
                            if ('url' in data) {
                                var url = data['url'];
                                // Download CSV from Amazon S3
                                var download_link = document.createElement('a');
                                download_link.setAttribute('href', url);
                                download_link.setAttribute('download', filename);
                                download_link.click();
                                download_link.remove();
                                
                                // Display success message
                                hide_spinner();
                                display_success();
                            }
                            else if ('error' in data) {
                                hide_spinner();
                                
                                // Display error message
                                display_error("Request has failed. Please try again!");
                            }
                            else {
                                setTimeout(pollLatestData, 2000);
                            }
                        },
                    });
                }
                pollLatestData();
            }
            else {
                // Display error message
                display_error("No data available.");
            }
        },
        error: function(xhr, status, error) {
            hide_spinner();

            // Display error message
            var error_message = xhr.responseJSON['error'] || "Download failed!";
            display_error(error_message);
        }
    });
  })

// Load spinner for download
function load_spinner()
{
    $("#download-spinner").css('display', "inline-block");
    $("#download-text").text("Downloading...");
}

// Hide spinner for download
function hide_spinner()
{
    $("#download-spinner").css('display', "none");
    $("#download-text").text("Download");
}

function display_error(error_message)
{
    $("#success").hide();
    $("#warning").show();
    $(".warning-text").text(error_message);
    window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'smooth'
    });
}

function display_success()
{
    $("#warning").hide();
    $("#success").show();
    window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'smooth'
    });
}