
$(function () {
  $("#engraved-hat-select").change(function() {
    var val = $(this).val();

    var previewImage;

    if (val == "Alabama") {
    previewImage = "engrave-alabama.jpg";
    }

    if (val == "Arkansas") {
    previewImage = "engrave-arkansas.jpg";
    }

    if (val == "Alaska") {
    previewImage = "engrave-alaska.jpg";
    }


    if (val == "Arizona") {
    previewImage = "engrave-arizona.jpg";
    }

    if (val == "California") {
    previewImage = "engrave-california.jpg";
    }

    if (val == "Colorado") {
    previewImage = "engrave-colorado.jpg";
    }

    if (val == "Connecticut") {
    previewImage = "engrave-connecticut.jpg";
    }

    if (val == "Delaware") {
    previewImage = "engrave-delaware.jpg";
    }

    if (val == "Florida") {
    previewImage = "engrave-florida.jpg";
    }

    if (val == "Georgia") {
    previewImage = "engrave-georgia.jpg";
    }

    if (val == "Hawaii") {
    previewImage = "engrave-hawaii.jpg";
    }

    if (val == "Idaho") {
    previewImage = "engrave-idaho.jpg";
    }

    if (val == "Illinois") {
    previewImage = "engrave-illinois.jpg";
    }

    if (val == "Indiana") {
    previewImage = "engrave-indiana.jpg";
    }

    if (val == "Iowa") {
    previewImage = "engrave-iowa.jpg";
    }

    if (val == "Kansas") {
    previewImage = "engrave-kansas.jpg";
    }

    if (val == "Kentucky") {
    previewImage = "engrave-kentucky.jpg";
    }

    if (val == "Louisiana") {
    previewImage = "engrave-louisiana.jpg";
    }

    if (val == "Maine") {
    previewImage = "engrave-maine.jpg";
    }

    if (val == "Maryland") {
    previewImage = "engrave-maryland.jpg";
    }

    if (val == "Massachusetts") {
    previewImage = "engrave-massachusetts.jpg";
    }

    if (val == "Michigan") {
    previewImage = "engrave-michigan.jpg";
    }

    if (val == "Minnesota") {
    previewImage = "engrave-minnesota.jpg";
    }

    if (val == "Mississippi") {
    previewImage = "engrave-mississippi.jpg";
    }

    if (val == "Missouri") {
    previewImage = "engrave-missouri.jpg";
    }

    if (val == "Montana") {
    previewImage = "engrave-montana.jpg";
    }

    if (val == "Nebraska") {
    previewImage = "engrave-nebraska.jpg";
    }

    if (val == "Nevada") {
    previewImage = "engrave-nevada.jpg";
    }

    if (val == "New-Hampshire") {
    previewImage = "engrave-new-hampshire.jpg";
    }

    if (val == "New-Jersey") {
    previewImage = "engrave-new-jersey.jpg";
    }

    if (val == "New-Mexico") {
    previewImage = "engrave-new-mexico.jpg";
    }

    if (val == "New-York") {
    previewImage = "engrave-new-york.jpg";
    }

    if (val == "North-Carolina") {
    previewImage = "engrave-north-carolina.jpg";
    }

    if (val == "North-Dakota") {
    previewImage = "engrave-north-dakota.jpg";
    }

    if (val == "Ohio") {
    previewImage = "engrave-ohio.jpg";
    }

    if (val == "Oklahoma") {
    previewImage = "engrave-oklahoma.jpg";
    }

    if (val == "Oregon") {
    previewImage = "engrave-oregon.jpg";
    }

    if (val == "Pennsylvania") {
    previewImage = "engrave-pennsylvania.jpg";
    }

    if (val == "Rhode-Island") {
    previewImage = "engrave-rhode-island.jpg";
    }

    if (val == "South-Carolina") {
    previewImage = "engrave-south-carolina.jpg";
    }

    if (val == "South-Dakota") {
    previewImage = "engrave-south-dakota.jpg";
    }

    if (val == "Tennessee") {
    previewImage = "engrave-tennessee.jpg";
    }

    if (val == "Texas") {
    previewImage = "engrave-texas.jpg";
    }

    if (val == "Utah") {
    previewImage = "engrave-utah.jpg";
    }

    if (val == "Vermont") {
    previewImage = "engrave-vermont.jpg";
    }

    if (val == "Virginia") {
    previewImage = "engrave-virginia.jpg";
    }

    if (val == "Washington") {
    previewImage = "engrave-washington.jpg";
    }

    if (val == "Washington-DC") {
    previewImage = "engrave-washington-dc.jpg";
    }

    if (val == "West-Virginia") {
    previewImage = "engrave-west-virginia.jpg";
    }

    if (val == "Wisconsin") {
    previewImage = "engrave-wisconsin.jpg";
    }

    if (val == "Wyoming") {
    previewImage = "engrave-wyoming.jpg";
    }


    $("#preview_image_img").attr("src","https://citylocs.com/apps/preview/img/" + previewImage);
  });
});
