
Stage, set, Map:
Map tools. The point should me renamed to "Select". It allows for map drag as it does today. But also, when clicking in a token, allows for the same options as clicking in a character on Actors Set. If the token is a character.

A new map tool called: "move" will be used to move tokens around. But also can drag the map as the point currently does. On tools tray its right below the Select.
Here we will also have the option to move a token to another layer in the same map.

The map tools tray need some divs for tool category. And reorder. It should be:
Select
Move
Highlight
Grab Attention
<div>
Reveal
Known
Hide
<div>
Full editor

On main menu, where we can select location and layer, add a div and a token selector dropdown. When a token is selected that way the camera will focus on it (for the admin only, not grab players attention there.)

Map Editor:
We dont need a "editin layer" dropdown. We can add a button right next to the layer list to select it.


-----

Actions:

Actions definition. The actions building page is confusing.
Action seletor card should occupy the whole of that page. With good fileters, because its goign to be a lot of actions i na real Saga Template.
When clicked, we will open a action edit modal.
The modal has two tabs: Settings, with name , descrition, who can do, etc.
And Mechanics tab. with cost, costs, gains and actions tirgged.

We need to improve the number of costs and gains. Currenly they are either a fixed number or a max box.
Instead of the max checkbox we will have a formula drop down. With Max, Fixed (both we hae now). But also a formula value.
We will need a formula builder.
For exemple, the user should be able to do "Level D20 + INT", the gained will roll a D20 , variable level times (so its a bit random everytime the action is used), sum it all and also add the variable int value.

To have quicker access to actions, we need an actions stage set.
On the main meu it will have first the action type seelctor (group, player etc), them the actor selector (the sepecific player, grou, item), and them the action selector, and the run button. Simple like this.
Actually, we currenlty do this all via "sets", but this, and the EFX - controls doesnt need a set. I t hink Stage can have a controls list, where we can toggle if we are going to have the EFX - Controls (default on but only appear in the meny if theres a leaast 1 EFX set on stage), and Action Controls (default on). 

----

Characters. The character will have a new tab with "Admin", Identiy and Variables: Classes
Classes are a new concpet and is NOT diretly related to DnD Classes...
A class is defind in the Saga Template. And it adds variables to the character.
So meaning, the character currently chares variables between categories, right?
The current variables are also variables shared between classes.
And classes add variables.

A character can have many classes and classes has levels.
For example, for a DnD template.
Races are classes, because htey can add resources (variables) to the character.
And dnd classes are also our app classes, for the same reason.

Classes are defined by the Saga TEmplate, as we said. And it has levels. Each level defines the group of variables.
This is to mimic Dnd classes and other RPG selection of classes.
In Dnd, some talents are classes too because they add resources.

If you think of a better name then classes, rename it.

Classes have categories, like Talent, Class, Race. The list of categori is defined in the saga template.

When displaying classes in teh character display templates, it can be filtered by category se we can show (Class classes) and (class levels). So it can show Human, Warrior 4, and Talent in different points of the character display template.

---

Performance

A lot of dice animations cost performance. Also does their shaders.
Add on user settings of the saga two performance options:
Turn off Dice animations: this case the user will see onl the dice in final position and the dice in the tray owont be turned. This is on by default
Simplify dice visuaks: dices are still 3D, but all shaders will be replaced by a simple one: dice in the user color with no normal map or other heavy features of some dice stles. Just a very simple lighteight 3d user coloured dice.