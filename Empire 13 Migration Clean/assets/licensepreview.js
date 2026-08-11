// this changes the input to uppercase
function changeToUpperCase(t) {
  var eleVal = document.getElementById(t.id);
  eleVal.value= eleVal.value.toUpperCase();
}

function letUsSnap() {

  // generate random digits that will be used for the name of the preview image
  $('#license-preview-id').attr('value', 'https://citylocs.com/apps/preview/screenshot/'+previewImageId+'.png');

  domtoimage.toJpeg(document.getElementById('img_preview_fancybox'), { quality: 0.95 })
    .then(function (dataUrl) {
    	 $.post("https://citylocs.com/apps/preview/screenshot/save_screenshot.php", {data: dataUrl, image: previewImageId}, function (file){
     	 });
    });
}


// this will retrieve the fonts used in preview
function getFonts () {
     var o = [],
          sheet = document.styleSheets,
          rule = null,
          i = sheet.length, j;
      while( 0 <= --i ){
          try{rule = sheet[i].rules || sheet[i].cssRules || [];}catch(e){continue;}
          j = rule.length;
          while( 0 <= --j ){
            try{
              if(rule[j].toString() == "[object CSSFontFaceRule]"|| rule[j].constructor.name === 'CSSFontFaceRule'){
              fontfamily = rule[j].style.fontFamily || rule[j].style.cssText.match(/font-family\s*:\s*([^;\}]*)\s*[;}]/i)[1];
              o.push(fontfamily);
            };
            }catch(e){}
          }
      }
      return o;
}

// this removes any invalid characters such as emojis from first input
function removeInvalidCharsTop() {

        	// declaring a variable for the only characters allowed
      	var ranges = [
          '\ud83c[\udf00-\udfff]', // U+1F300 to U+1F3FF
          '\ud83d[\udc00-\ude4f]', // U+1F400 to U+1F64F
          '\ud83d[\ude80-\udeff]'  // U+1F680 to U+1F6FF
        ];

  var str = $('#user_input').val();

  str = str.replace(new RegExp(ranges.join('|'), 'g'), '');
  $("#user_input").val(str);
}

function removeInvalidCharsBottom() {

        	// declaring a variable for the only characters allowed
      	var ranges = [
          '\ud83c[\udf00-\udfff]', // U+1F300 to U+1F3FF
          '\ud83d[\udc00-\ude4f]', // U+1F400 to U+1F64F
          '\ud83d[\ude80-\udeff]'  // U+1F680 to U+1F6FF
        ];

  var str = $('#second_user_input').val();

  str = str.replace(new RegExp(ranges.join('|'), 'g'), '');
  $("#second_user_input").val(str);
}

var fonts = getFonts();
try{
  fontLoader = new FontLoader(fonts, {}, 3000);
  fontLoader.loadFonts();
}catch(e){}

jQuery(document).ready(function() {
    var originTop = 0;
    var originLeft = 0;
    var originWidth = 0;
    var originHeight = 0;
    $("#preview_btn").click( function(event) {

        if($("#user_input").val() == "" || $('#engraved-hat-select').val() == ""){
           return false;
        }

		    removeInvalidCharsTop()
        removeInvalidCharsBottom()
        url = 'https://citylocs.com/apps/preview/generate_image_new.php?';
        url += 'font='+ $("#font_select option:selected").val();
        url += '&id='+ $("#template_id").val();
        var selected_font = $("#font_select option:selected").val();
        var customText = $("#user_input").val();
        var secondCustomText = $("#second_user_input").val();

        $.ajax({
            url: url,
            dataType: 'jsonp',
            jsonpCallback: 'callback',
            type: 'GET',
            success: function (jsonp) {

                // $("#image_preview_image").attr('src', jsonp.img);
                $("#img_preview_text_container").css('color', jsonp.color);
                $("#img_preview_text_container").css('top', jsonp.top);
                $("#img_preview_text_container").css('left', jsonp.left);
                $("#img_preview_text_container").css('width', jsonp.width);
                $("#img_preview_text_container").css('height', jsonp.height);
                // $("#img_preview_fancybox").click();
              	$('.fancybox-title span').attr('class', 'preview_information_text');
                // $("#img_preview_text").remove();


                var heightTypeBottomDiv = (jsonp.height/3) * 1;

                // textforshow is to get the length of the string so we can adjust depending on length
                 var textforshow  = $("#user_input").val().substring(0, jsonp.length);

               	 autoResize(jsonp.top, jsonp.left,jsonp.width, jsonp.height);

                  // this if statement checks to see if there is value in second field if not run only top
                    if(secondCustomText == ""){
                      function prepareDivSingleType() {
                        var r = $.Deferred();
                      	$("#img_preview_text_container").attr('class', 'fit-single');
          				      $('#img_preview_text_container').html('<span style="font-family:'+selected_font+'">' + customText + '</span>');
                     	  var heightTopDivText = $("#img_preview_text_container").height();
                        heightTopDivText = Math.round(heightTopDivText);
                      	$("#img_preview_text_container span").css('line-height', heightTopDivText+"px");

                        return r;
                        }

                      function resizeUserCustomInput() {
                        var a = $.Deferred();

                      	$('.fit-single').textfill({maxFontPixels:0});
                        return a;
                        }

                      	prepareDivSingleType().done( resizeUserCustomInput() );

                    } else {
                      function prepareDivForTopType() {
                        var r = $.Deferred();
						$('#img_preview_text_container').html('<div class="fit" id="img_preview_container1" style="color:'+jsonp.color+';"><span style="font-family:'+selected_font+'">' + customText + '</span></div> <div class="fit2" id="img_preview_container2" style="color:'+jsonp.color+'; text-align: center; margin-left: auto; margin-right: auto;"> <span style="font-family: '+selected_font+'; text-align: center;">' + secondCustomText + '</span> </div>');
                      	autoResizeTopTextDiv(jsonp.top, jsonp.left, jsonp.width, jsonp.height);

                        return r;
                        }

                      function resizeTopTypeInput(){
                        var a = $.Deferred();
                        var heightTopDivText2Lines = $("#img_preview_container").height();
                        $("#img_preview_container1 span").css('line-height', heightTopDivText2Lines+"px");
                        $('.fit').textfill({maxFontPixels: 0});

                        return a;
                        }
                      	prepareDivForTopType().done( resizeTopTypeInput() );

                      function prepareDivForBottomType(){
                        var p = $.Deferred();
                        var widthTypeTop = $("#img_preview_container1 span").width();
                      	var heightTypeTop = $("#img_preview_container1 span").height();
						$("#img_preview_container1").height(heightTypeTop);
                        $("#img_preview_container1 span").css('line-height', heightTypeTop+"px");
                        autoResizeBottomTextDiv(jsonp.top, jsonp.left, widthTypeTop, heightTypeBottomDiv);
                      	$("#img_preview_container2").width(widthTypeTop);


                        return p;
	                    }

                      function resizeBottomTypeInput() {
                        var s = $.Deferred();
                        var heightBottomDivText2Lines = $("#img_preview_container2").height();
                        $("#img_preview_container2 span").css('line-height', heightBottomDivText2Lines+"px");

                      	$('.fit2').textfill({maxFontPixels: 0});

                        var containerCenterDiv = ($('#img_preview_text_container').height() - $("#img_preview_container1 span").height()) - $("#img_preview_container2 span").height();
                        $('#img_preview_text_container').css('padding-top', Math.round(containerCenterDiv / 2));

                        return s;
                        }


                      	prepareDivForBottomType().done( resizeBottomTypeInput() );



                   }
                // this if statement checks length of type so adjust radius
                if(textforshow.length < 9){
                 // $('#img_preview_text').arctext({radius: parseInt(jsonp.radius), dir: parseInt(jsonp.dir)});
                }

              	// we take snap shot of preview customer sees


            	// $('#img_preview_text').arctext({radius: parseInt(jsonp.radius2), dir: parseInt(jsonp.dir)});
                $('#img_preview_text').css('font-family', selected_font);

                $('#img_preview_secondText').css('font-family', selected_font);


                 // shrink(jsonp.align);

                 // shrinkTopTextDiv(jsonp.align);
                 //shrinkBottomTextDiv(jsonp.align);
            }
        });

        Fancybox.show([{ src: "#img_preview_fancybox", type: "inline" }]);
        return false;
    });

    // $("#img_preview_fancybox").fancybox({
    //     title: "This is only a preview text may be adjusted to look its best.",
    //     closeBtn    : true,
    //     openEffect  : 'elastic',
    //     closeEffect : 'elastic',
    //     scrolling   : 'no',
    //     overlayShow: false
    // });
    // var resized = false;
    // jQuery(window).resize(function() {
    //     if(jQuery('.preview_fancybox').css('display')=="none"){
    //       return false;
    //     }
    //     parent.jQuery.fancybox.close();
    //     if(resized !== false)
    //       clearTimeout(resized);
    //       resized = setTimeout(function(){
    //         jQuery("#preview_btn").click();
    //     },500);
    // });
});




