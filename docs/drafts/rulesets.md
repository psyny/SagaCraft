The ruleset editor is a new feature, and a very hard one to design.

Because it define actions. Actions that consume player/item/group resources, and add other resources and make an effect.

For example, a character action can be Short Rest from DnD, that can consume hit die to regain HP and spell slots.
And long rests are another example.
And a group action of short or long rest will run character actions for those for every characer in the group. So group actions can also trigger character actions. Or, in general, actions can trigger actions.

So, what im thinking of this design:

An action has:
-Type: group, character, item
-Who can trigger it: owner (char, item,etc), any player, any group member, admin only.

-List of consumed variables, where each:
--source: character (avaible to character and item too, it will be the character owning the item), item (only avaible to item), group (avaiable to group character and item, you can see how), all characer in group (avaible to group)
--Variable: name of variable
--Ammount: ...
--Consume: if true, will consume the resource
--Mandatory: if true, will only run the action if the enough ammount is avaible

-List of generated variables, where each:
--target: character (avaible to character and item too, it will be the character owning the item), item (only avaible to item), group (avaiable to group character and item, you can see how), all characer in group (avaible to group)
--Variable: name of variable
--Ammount: ...

-List of trigged actions, where each:
--target: same as added targets above.
--action: 
--ignore consumed: if true, will trigger the action ignoring the generated part of it
--ignore added: if. true, will triger the action ignored the generated part of it
--ignore actions: if true, will trigger the action ignred the actions trigged in chain of it.

You can improve on this design, but I think its close to what we want.

characters, groups, and items screen will have a new tab called "actions". 
For characters it acessible from the actors stage set, when click the characters, we see the immersive and informative and relationsups options? also add an acions tab there.

Also, for variables, we need a new type:
calculated. That can get info from iventory, group, etc.
For exmaple, total weight carried by a character.
I trust you can add this easily and deduce how this variable type works for characters, groups and items.

