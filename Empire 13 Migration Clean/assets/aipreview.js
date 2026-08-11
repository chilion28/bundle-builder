// this changes the input to uppercase
function changeToUpperCase(t) {
  var eleVal = document.getElementById(t.id);
  eleVal.value = eleVal.value.toUpperCase();
}

function letUsSnap() {

  // generate random digits that will be used for the name of the preview image
  $('#license-preview-id').attr('value', 'https://citylocs.com/apps/preview/screenshot/' + previewImageId + '.png');

  domtoimage.toJpeg(document.getElementById('img_preview_fancybox'), {
      quality: 0.95
    })
    .then(function(dataUrl) {
      $.post("https://citylocs.com/apps/preview/screenshot/save_screenshot.php", {
        data: dataUrl,
        image: previewImageId
      }, function(file) {});
    });
}

// this will retrieve the fonts used in preview
function getFonts() {
  var o = [],
    sheet = document.styleSheets,
    rule = null,
    i = sheet.length,
    j;
  while (0 <= --i) {
    try {
      rule = sheet[i].rules || sheet[i].cssRules || [];
    } catch (e) {
      continue;
    }
    j = rule.length;
    while (0 <= --j) {
      try {
        if (rule[j].toString() == "[object CSSFontFaceRule]" || rule[j].constructor.name === 'CSSFontFaceRule') {
          fontfamily = rule[j].style.fontFamily || rule[j].style.cssText.match(/font-family\s*:\s*([^;\}]*)\s*[;}]/i)[1];
          o.push(fontfamily);
        };
      } catch (e) {}
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
    '\ud83d[\ude80-\udeff]' // U+1F680 to U+1F6FF
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
    '\ud83d[\ude80-\udeff]' // U+1F680 to U+1F6FF
  ];

  var str = $('#second_user_input').val();

  str = str.replace(new RegExp(ranges.join('|'), 'g'), '');
  $("#second_user_input").val(str);
}

var fonts = getFonts();
try {
  fontLoader = new FontLoader(fonts, {}, 3000);
  fontLoader.loadFonts();
} catch (e) {}

// $(function() {


//   //calculate width placement center of object

//   $(document).on("click", "#plate_preview_btn", function() {
//     $.featherlight('#previewCompleteContainer', {});

//     $.featherlight.defaults.afterContent = function() {
//       var flc = $(".featherlight-content");
      


//       // set size of text box 
//       var featherLightInner = flc.find('.featherlight-inner');
//       var containerWidth = featherLightInner.width();
//       console.log(containerWidth);
      
//       var containerHeight = featherLightInner.height();
//       console.log(containerHeight);

//       var textContainerWidthArea = containerWidth * custom1WidthTypeArea;
//       var textContainerHeightArea = containerHeight * custom1HeightTypeArea;
      
//       var previewBox = flc.find('#product_preview_text_container');
//       previewBox.css("width", textContainerWidthArea + 'px');
//       previewBox.css("height", textContainerHeightArea + 'px');
      
      
//       // var selected_font = $("#font_select option:selected").val();
//       // var customText = $("#user_input").val();
//       // var secondCustomText = $("#second_user_input").val();
//       // 
//       // // change img background
//       // $('#product_preview_text_container').html('<div id="custom1Text" style="background-color: red; width: auto; height: auto; white-space: nowrap; display: inline-block;">' + 'GuzmanO' + '</div>');
//     };
// });
//     // $.featherlight.defaults.afterOpen = function() {
//     //   var flc = $(".featherlight-content");
//     //   var previewBox = flc.find('#product_preview_text_container');
//     //   previewBox.css('width', '400px');
//     // };
  

//   function sizeText() {



//     // add css for container
//     $('#product_preview_text_container').css("width", '300px');
//     $('#product_preview_text_container').css("height", textContainerHeightArea + 'px');
//     //                 $('#product_preview_text_container').css("left", custom1LeftPlacement + '%');
//     //                 $('#product_preview_text_container').css("top", custom1FromTop);
//     //                 $('#product_preview_text_container').css("font-family", "oklahoma.ttf");

//     //alert(custom1WidthTypeArea);
//     //console.log(containerWidth, containerHeight);

//     //   var textWidth = document.getElementById('custom1Text').clientWidth;
//     //   var textHeight = document.getElementById('custom1Text').clientHeight;


//     //   var scaleHeight = (containerHeight/textHeight).toFixed(1);
//     //   var scaleWidth = (containerWidth/textWidth).toFixed(1);


//     //$('#custom1Text').css('transform', 'scale(' + scaleHeight + ', ' + scaleWidth + ')');

//   }
// });

$(function() {  
  
  var currentProductName = $(".product_name").text();
  // get product no space
  var productNoSpace = currentProductName.split(' ').join('_');
  
  // whether input is one or two
  var inputTextOption = plateData[productNoSpace]['inputOption'];
  
  if( inputTextOption == 'one' ) {
  	$("#second_user_input").hide();
  }
  
  // change image  
  $('#platePreviewImage').attr("src", plateData[productNoSpace]['img']);
  
  $(".fancybox").fancybox({
    title: "This is only a preview text may be adjusted to look its best.",
    closeBtn    : true,
    openEffect  : 'elastic',
    closeEffect : 'elastic',
    scrolling   : 'no',
    overlayShow: false,
    fitToView: false,
    loop : false,
    maxWidth: 500,
    beforeShow: function(){
    	
 
    },
    afterShow: function(current) {
      	setTextBox(productNoSpace, inputTextOption)
        
      }

});
})
                             
function setTextBox(productNoSpace, inputTextOption) {
  
  // value from input one 
  var customOne = $('#user_input').val();
  
  // value from two input 2
  var customTwo = $('#second_user_input').val();

  // get custom 1 Width Type
  var custom1WidthTypeArea = parseFloat('.' + plateData[productNoSpace]['custom1Width']);

  // get custom 1 Height Type
  var custom1HeightTypeArea = parseFloat('.' + plateData[productNoSpace]['custom1Height']);

  // get custom 1 From Top
  var custom1FromTop = parseFloat('.' + plateData[productNoSpace]['custom1FromTop']);
  
  // set size of lightbox area
  var lightBoxWidthContainer = $("#entirePreviewBox").width();
  var lightBoxHeightContainer = $("#entirePreviewBox").height();
    
  // set textArea Container 
  var textContainerWidthArea = Number((lightBoxWidthContainer * custom1WidthTypeArea).toFixed());
  var textContainerHeightArea = Number((lightBoxHeightContainer * custom1HeightTypeArea).toFixed());
  var calculateTextContainerFromTop = Number((lightBoxHeightContainer * custom1FromTop).toFixed());
  var textContainerFromTop = lightBoxHeightContainer - calculateTextContainerFromTop;
  
  // get custom 1 left placement
  var custom1LeftPlacement = Number(((lightBoxWidthContainer - textContainerWidthArea) / 2).toFixed());

  var cr = plateData[productNoSpace]['r'];
  var cg = plateData[productNoSpace]['g'];
  var cb = plateData[productNoSpace]['b'];
  var colorRgb = 'rgb(' + cr + ', ' + cg + ', ' + cb + ')';
  
  // input text one
      if( !customTwo ) {
        
  $('.fancybox-title span').attr('class', 'preview_information_text');
  
  $('#product_preview_text_container').html('<div id="customOneTextFit" style="display: inline;">' + customOne + '</div>');        

  $('#customOneTextFit').css('font-family', plateData[productNoSpace]['font']);
  $('#product_preview_text_container').css('width', textContainerWidthArea + 'px');
 // $('#customOnePreviewText').css('width', textContainerWidthArea + 'px');
 // $('#customOnePreviewText').css('height', textContainerHeightArea + 'px');
  $('#product_preview_text_container').css('height', textContainerHeightArea + 'px');
  $('#product_preview_text_container').css('line-height', textContainerHeightArea + 'px');
  $('#product_preview_text_container').css('top', textContainerFromTop + 'px');
  $('#product_preview_text_container').css('left', custom1LeftPlacement + 'px');
  $('#product_preview_text_container').css('color', colorRgb);

      $('#product_preview_text_container').textfill({
        maxFontPixels: 0,
        innerTag: 'div',
        complete: function() {
          
		      	var sizeOfTextPixels = $('#customOneTextFit').css('font-size');
          		$('#customOneTextFit').css('display', 'block');

              	//   $('#product_preview_text_container span').css('line-height', sizeOfTextPixels );

                var sizeOfText = sizeOfTextPixels.replace('px', '');

                var sizeOfScaleText1 = (textContainerHeightArea / sizeOfText).toFixed(2);

                if(sizeOfScaleText1 > parseFloat(1.5)) {
                    $('#customOneTextFit').css('transform', 'scaleY(' + sizeOfScaleText1 + ')')
               }
		},
      });
        
      } else if ( inputTextOption == 'two' ) {
      	
        $('.fancybox-title span').attr('class', 'preview_information_text');
        
        $('#product_preview_text_container').html('<div id="customOneTextFitContainer"></div><div id="customTwoTextFitContainer"></div>');
        $('#product_preview_text_container').css('height', textContainerHeightArea + 'px');
        $('#product_preview_text_container').css('width', textContainerWidthArea + 'px');
        $('#product_preview_text_container').css('top', textContainerFromTop + 'px');
        $('#product_preview_text_container').css('left', custom1LeftPlacement + 'px');
        
        var calculateTopTextContainer = (textContainerHeightArea * .66).toFixed(2);
        var calculateBottomTextContainer = textContainerHeightArea - calculateTopTextContainer;
        
        $('#customOneTextFitContainer').css('height', calculateTopTextContainer + 'px');
        $('#customTwoTextFitContainer').css('height', calculateBottomTextContainer + 'px');
        
        // add text for each area 
        $('#customOneTextFitContainer').html('<div id="custom1TextFit" style="display: inline;">' + customOne + '</div>');
        $('#customTwoTextFitContainer').html('<div id="custom2TextFit" style="display: inline;">' + customTwo + '</div>');
        
        // add this to custoneone and two
        $('#product_preview_text_container').css('color', colorRgb);
        
        //font setup
        $('#custom1TextFit').css('font-family', plateData[productNoSpace]['font']);
        $('#custom2TextFit').css('font-family', plateData[productNoSpace]['font']);
        
              $('#customOneTextFitContainer').textfill({
                maxFontPixels: 0,
                innerTag: 'div',
                complete: function() {
          
		      	var sizeOfTextPixels = $('#custom1TextFit').css('font-size');
              	$('#customOneTextFitContainer').css('line-height', sizeOfTextPixels );
                
                // get height of this container
                var text1ContainerHeightArea = $('#customOneTextFitContainer').css('height').replace('px', '');
                  
                $('#custom1TextFit').css('display', 'block');

                var sizeOfText = sizeOfTextPixels.replace('px', '');

                var sizeOfScaleText1 = (text1ContainerHeightArea / sizeOfText).toFixed(2);

                if(sizeOfScaleText1 > parseFloat(1.5)) {
                    $('#custom1TextFit').css('transform', 'scaleY(' + sizeOfScaleText1 + ')')
               }
                },
              });
        
              $('#customTwoTextFitContainer').textfill({
                maxFontPixels: 0,
                innerTag: 'div',
                complete: function() {
          
		      	var sizeOfTextPixels = $('#custom2TextFit').css('font-size');
              	$('#customTwoTextFitContainer').css('line-height', sizeOfTextPixels );
                  
                // get height of this container
                var text2ContainerHeightArea = $('#customTwoTextFitContainer').css('height').replace('px', '');
                  
                $('#custom2TextFit').css('display', 'block');

                var sizeOfText = sizeOfTextPixels.replace('px', '');

                var sizeOfScaleText2 = (text2ContainerHeightArea / sizeOfText).toFixed(2);

                if(sizeOfScaleText1 > parseFloat(1.5)) {
                    $('#custom2TextFit').css('transform', 'scaleY(' + sizeOfScaleText2 + ')')
               }
                },
              });
        

      }
  
}