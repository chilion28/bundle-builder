function autoResize(originTop,originLeft,originWidth,originHeight){
    var image = document.getElementById('preview_image_img');
    var width = image.naturalWidth;
    var height = image.naturalHeight;
   

    var cwidth = jQuery("#preview_image_img").width();
    var cheight = jQuery("#preview_image_img").height();
  
    getRatiowidth = cwidth/width;
    getRatioheight = cheight/height;
  
    newboxwidth = getRatiowidth*originWidth;
    newboxheight = getRatioheight*originHeight;

    newboxtop = getRatioheight*originTop;
    newboxleft =getRatiowidth*originLeft;
    jQuery("#img_preview_text_container").css('top', Math.round(newboxtop) + 'px');
    jQuery("#img_preview_text_container").css('left', Math.round(newboxleft) + 'px');

    jQuery("#img_preview_text_container").width(Math.round(newboxwidth));
    jQuery("#img_preview_text_container").height(Math.round(newboxheight));
}


function autoResizeTopTextDiv(originTop,originLeft,originWidth,originHeight){
   var image = document.getElementById('preview_image_img');
   var width = image.naturalWidth;
   var height = image.naturalHeight;
  

   var cwidth = jQuery("#preview_image_img").width();
   var cheight = jQuery("#preview_image_img").height();
 
   getRatiowidth = cwidth/width;
   getRatioheight = cheight/height;
 
   newboxwidth = getRatiowidth*originWidth;
   getboxheight = getRatioheight*originHeight;
   newboxheight = (getboxheight/3) * 2;

   newboxtop = getRatioheight*originTop;
   newboxleft = getRatiowidth*originLeft;
   jQuery("#img_preview_container1").css('top', Math.round(newboxtop) + 'px');
   jQuery("#img_preview_container1").css('left', Math.round(newboxleft) + 'px');

   jQuery("#img_preview_container1").width(Math.round(newboxwidth));
   jQuery("#img_preview_container1").height(Math.round(newboxheight));
}

function autoResizeBottomTextDiv(originTop,originLeft,originWidth,originHeight){
   var image = document.getElementById('preview_image_img');
   var width = image.naturalWidth;
   var height = image.naturalHeight;
  

   var cwidth = jQuery("#preview_image_img").width();
   var cheight = jQuery("#preview_image_img").height();
 
   getRatiowidth = cwidth/width;
   getRatioheight = cheight/height;
 
   newboxwidth = getRatiowidth*originWidth;
   newboxheight = getRatioheight*originHeight;

   newboxtop = getRatioheight*originTop;
   newboxleft = getRatiowidth*originLeft;
   jQuery("#img_preview_container2").css('top', Math.round(newboxtop) + 'px');
//   jQuery("#img_preview_container2").css('left', newboxleft + 'px');
	

//   jQuery("#img_preview_container2").width("#img_preview_container1 span")
   
   jQuery("#img_preview_container2").height(Math.round(newboxheight));
}


function shrink(align)
{
    while(parseInt(jQuery("#img_preview_text").width()) < parseInt(jQuery("#img_preview_text_container").width())){
        fontsize = jQuery("#img_preview_text").css('font-size');
        fontsize = parseInt(fontsize.replace("px", ""));
        fontsize = fontsize + 1;
        jQuery("#img_preview_text").css('font-size', fontsize + 'px');
        if(parseInt(jQuery("#img_preview_text").width()) > parseInt(jQuery("#img_preview_text_container").width())){
            fontsize = jQuery("#img_preview_text").css('font-size');
            fontsize = parseInt(fontsize.replace("px", ""));
            fontsize = fontsize - 1;
             jQuery("#img_preview_text").css('font-size', Math.ceil(fontsize) + 'px');
             break;
        }
    }

    while(parseInt(jQuery("#img_preview_text").width()) > parseInt(jQuery("#img_preview_text_container").width())){
        fontsize = jQuery("#img_preview_text").css('font-size');
        fontsize = parseInt(fontsize.replace("px", ""));
        fontsize = fontsize - 1;
        jQuery("#img_preview_text").css('font-size', fontsize + 'px');
    }

    while(parseInt(jQuery("#img_preview_text").height()) > parseInt(jQuery("#img_preview_text_container").height())){
        fontsize = jQuery("#img_preview_text").css('font-size');
        fontsize = parseInt(fontsize.replace("px", ""));
        fontsize = fontsize - 1;
        jQuery("#img_preview_text").css('font-size', fontsize + 'px');
    }

    bheight = jQuery("#img_preview_text_container").height();
    textheight = jQuery("#img_preview_text").height();
    delta = (bheight - textheight)/2 ;
    jQuery("#img_preview_text").css('top', Math.ceil(delta) + 'px');

    bwidth= jQuery("#img_preview_text_container").width();
    textwidth =  jQuery("#img_preview_text").width();
    delta = (bwidth - textwidth)/2 ;
    if(delta >0){
        if(align=="l"){
            jQuery("#img_preview_text").css('left', '0px');    
        }else if(align=="r"){
            jQuery("#img_preview_text").css('left', jQuery("#img_preview_text_container").width()-textwidth + 'px');
        }else{
            jQuery("#img_preview_text").css('left', Math.ceil(delta) + 'px');
        }
    }
}

function shrinkTopTextDiv(align)
{
    while(parseInt(jQuery("#img_preview_text1").width()) < parseInt(jQuery("#img_preview_container1").width())){
        fontsize = jQuery("#img_preview_text1").css('font-size');
        fontsize = parseInt(fontsize.replace("px", ""));
        fontsize = fontsize + 1;
        jQuery("#img_preview_text1").css('font-size', fontsize + 'px');
        if(parseInt(jQuery("#img_preview_text1").width()) > parseInt(jQuery("#img_preview_container1").width())){
            fontsize = jQuery("#img_preview_text1").css('font-size');
            fontsize = parseInt(fontsize.replace("px", ""));
            fontsize = fontsize - 1;
             jQuery("#img_preview_text1").css('font-size', Math.ceil(fontsize) + 'px');
             break;
        }
    }

    while(parseInt(jQuery("#img_preview_text1").width()) > parseInt(jQuery("#img_preview_container1").width())){
        fontsize = jQuery("#img_preview_text1").css('font-size');
        fontsize = parseInt(fontsize.replace("px", ""));
        fontsize = fontsize - 1;
        jQuery("#img_preview_text1").css('font-size', fontsize + 'px');
    }

    while(parseInt(jQuery("#img_preview_text1").height()) > parseInt(jQuery("#img_preview_container1").height())){
        fontsize = jQuery("#img_preview_text1").css('font-size');
        fontsize = parseInt(fontsize.replace("px", ""));
        fontsize = fontsize - 1;
        jQuery("#img_preview_text1").css('font-size', fontsize + 'px');
    }

    bheight = jQuery("#img_preview_container1").height();
    textheight = jQuery("#img_preview_text1").height();
    delta = (bheight - textheight)/2 ;
    jQuery("#img_preview_text1").css('top', Math.ceil(delta) + 'px');

    bwidth= jQuery("#img_preview_container1").width();
    textwidth =  jQuery("#img_preview_text1").width();
    delta = (bwidth - textwidth)/2 ;
    if(delta >0){
        if(align=="l"){
            jQuery("#img_preview_text1").css('left', '0px');    
        }else if(align=="r"){
            jQuery("#img_preview_text1").css('left', jQuery("#img_preview_container1").width()-textwidth + 'px');
        }else{
            jQuery("#img_preview_text1").css('left', Math.ceil(delta) + 'px');
        }
    }
}

function shrinkBottomTextDiv(align)
{
    while(parseInt(jQuery("#img_preview_secondText").width()) < parseInt(jQuery("#img_preview_container2").width())){
        fontsize = jQuery("#img_preview_secondText").css('font-size');
        fontsize = parseInt(fontsize.replace("px", ""));
        fontsize = fontsize + 1;
        jQuery("#img_preview_secondText").css('font-size', fontsize + 'px');
        if(parseInt(jQuery("#img_preview_secondText").width()) > parseInt(jQuery("#img_preview_container2").width())){
            fontsize = jQuery("#img_preview_secondText").css('font-size');
            fontsize = parseInt(fontsize.replace("px", ""));
            fontsize = fontsize - 1;
             jQuery("#img_preview_secondText").css('font-size', Math.ceil(fontsize) + 'px');
             break;
        }
    }

    while(parseInt(jQuery("#img_preview_secondText").width()) > parseInt(jQuery("#img_preview_container2").width())){
        fontsize = jQuery("#img_preview_secondText").css('font-size');
        fontsize = parseInt(fontsize.replace("px", ""));
        fontsize = fontsize - 1;
        jQuery("#img_preview_secondText").css('font-size', fontsize + 'px');
    }

    while(parseInt(jQuery("#img_preview_secondText").height()) > parseInt(jQuery("#img_preview_container2").height())){
        fontsize = jQuery("#img_preview_secondText").css('font-size');
        fontsize = parseInt(fontsize.replace("px", ""));
        fontsize = fontsize - 1;
        jQuery("#img_preview_secondText").css('font-size', fontsize + 'px');
    }

    bheight = jQuery("#img_preview_container2").height();
    textheight = jQuery("#img_preview_secondText").height();
    delta = (bheight - textheight)/2 ;
    jQuery("#img_preview_secondText").css('top', Math.ceil(delta) + 'px');

    bwidth= jQuery("#img_preview_container2").width();
    textwidth =  jQuery("#img_preview_secondText").width();
    delta = (bwidth - textwidth)/2 ;
    if(delta >0){
        if(align=="l"){
            jQuery("#img_preview_secondText").css('left', '0px');    
        }else if(align=="r"){
            jQuery("#img_preview_secondText").css('left', jQuery("#img_preview_container2").width()-textwidth + 'px');
        }else{
            jQuery("#img_preview_secondText").css('left', Math.ceil(delta) + 'px');
        }
    }
}
