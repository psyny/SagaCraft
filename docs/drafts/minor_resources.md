Some resourcers we mentioned in the docs but never got to add them:

-Documents: Multipage documents. Each page can be an image or a text. 
-Items: evdry rpg has items. Items can have shared variables, or variables per item category. What those variables are and the cateogirs themselves are goign to be defined by the Saga Template.

How theres an important piece. The Saga Template, currently we have been using the DnD Lite we talked about. But we dont have where teh DM can define and edit this template. We need a page for that.

Its going to be fairy complicated page. Initially, it will define default characters variables, chracter templates, item templates, items variables, and some other defaoult settings we will pick along the way. 
At some point it will also define how these variables interact (not now, but add this desire ot the docs). For exemple, we will have at some point Group and World actions. A group action on DnD would be Short and Long rests, that we need, somehow via editor, say it will consume something and recover HP and such. These rules should be defined by the DM at some point. We will get back to this, but you should know it will love in the Saga Template.

Important note: saga template should be saveable to JSON and shareable. So import and export. thats why we call a template.

So a saga template will holde:
-Characger Variables
-Item Variables
-Character Templates
-Item TEmplates
-Character GRoups (default when the saga is created with that template, still edditable on the runtime by DM)
-Some Stage Set default parameters like: Tabs for the Actors set, but not their parameters.
-And anything that would make sense for a system or narrative style template. But dont overwhel the options here, really really control how much.
